import { createRequire } from 'node:module';
import { buildExplainabilityReport } from './explainability.js';
import { buildFieldGraph } from './field/index.js';
import { scoreGravity } from './gravity/index.js';
import { logger } from './logger.js';
import { trace } from './trace/index.js';
import type {
  AnalyzeRequest,
  AnalyzeResponse,
  ConfidenceBucket,
  FixStep,
  MeridianError,
  SimulationContext,
  TTLWarning,
  Verdict,
} from './types.js';

// Bundlers (e.g. esbuild, used by @meridian/cli) can define this global at build
// time to inline the real @meridian/core version, since a runtime relative-path
// require would otherwise resolve against the bundle's own location instead of
// this package's location. When it isn't defined (plain `tsc` build, consumed as
// a normal npm dependency by @meridian/ai or @meridian/api), we fall back to
// reading package.json directly at runtime.
declare const __MERIDIAN_ENGINE_VERSION__: string | undefined;

function resolveEngineVersion(): string {
  if (typeof __MERIDIAN_ENGINE_VERSION__ !== 'undefined') {
    return __MERIDIAN_ENGINE_VERSION__;
  }
  const require = createRequire(import.meta.url);
  const { version } = require('../package.json') as { version: string };
  return version;
}

/** MERIDIAN product/engine version, sourced from packages/core/package.json so it never drifts. */
export const MERIDIAN_VERSION: string = resolveEngineVersion();

const DEFAULT_CONFIDENCE_THRESHOLD = 0.75;

/**
 * Compute verdict from TRACE, GRAVITY, and confidence inputs.
 *
 * @param traceSuccess - Whether simulation succeeded
 * @param blastRadius - Blast radius score
 * @param confidence - Confidence score
 * @param threshold - Minimum confidence for CLEAR
 * @param isStale - Whether simulation is stale
 * @returns Verdict and confidence
 */
export function computeVerdict(
  traceSuccess: boolean,
  blastRadius: number,
  confidence: number,
  threshold: number,
  isStale: boolean,
): { verdict: Verdict; confidence: number } {
  if (!traceSuccess) {
    return { verdict: 'ABORT', confidence: Math.min(confidence, 0.95) };
  }
  if (isStale || confidence < threshold) {
    return { verdict: 'WARN', confidence };
  }
  if (blastRadius >= 50) {
    return { verdict: 'WARN', confidence };
  }
  return { verdict: 'CLEAR', confidence };
}

/**
 * Compute confidence score from layer outputs.
 *
 * @param traceSuccess - Whether simulation succeeded
 * @param manifestCoverage - Manifest coverage ratio
 * @param isStale - Whether simulation is stale
 * @returns Confidence score 0.0 - 1.0
 */
export function computeConfidence(
  traceSuccess: boolean,
  manifestCoverage: number,
  isStale: boolean,
): number {
  let confidence = traceSuccess ? 0.85 : 0.3;
  confidence += manifestCoverage * 0.1;
  if (isStale) confidence -= 0.2;
  return Math.max(0, Math.min(1, Math.round(confidence * 100) / 100));
}

/**
 * Generate fix sequence for WARN or ABORT verdicts.
 *
 * @param input - Verdict and analysis context for fix step generation
 * @returns Fix steps or undefined
 */
export function generateFixSequence(input: {
  verdict: Verdict;
  traceSuccess: boolean;
  warnings?: string[];
  failureRootCause?: string;
  failureErrorCode?: string;
  ttlWarnings?: TTLWarning[];
  blastRadius?: number;
  manifestCoverage?: number;
}): FixStep[] | undefined {
  if (input.verdict !== 'WARN' && input.verdict !== 'ABORT') {
    return undefined;
  }

  const steps: FixStep[] = [];
  let order = 1;

  if (input.verdict === 'ABORT') {
    if (input.failureErrorCode === 'ENTRY_ARCHIVED') {
      steps.push({
        order: order++,
        operation: 'restore_archived_entry',
        description: 'Restore archived ledger entries or extend TTL before resubmitting',
        estimated_cost_stroops: 500,
        estimated_time_minutes: 15,
      });
    } else if (input.failureErrorCode === 'AUTH_REQUIRED') {
      steps.push({
        order: order++,
        operation: 'fix_auth',
        description: 'Ensure all require_auth credentials are signed and valid',
        estimated_cost_stroops: 100,
        estimated_time_minutes: 10,
      });
    } else if (input.failureErrorCode === 'INSUFFICIENT_BALANCE') {
      steps.push({
        order: order++,
        operation: 'fund_account',
        description: 'Add sufficient balance to cover fees and operation costs',
        estimated_cost_stroops: 0,
        estimated_time_minutes: 5,
      });
    } else {
      steps.push({
        order: order++,
        operation: 'diagnose',
        description: input.failureRootCause ?? 'Review simulation failure point',
        estimated_cost_stroops: 0,
        estimated_time_minutes: 5,
      });
    }
  }

  if (input.verdict === 'WARN') {
    if (input.warnings?.some((warning) => warning.includes('stale'))) {
      steps.push({
        order: order++,
        operation: 'refresh_ledger',
        description: 'Re-simulate against the latest ledger to refresh stale simulation data',
        estimated_cost_stroops: 0,
        estimated_time_minutes: 2,
      });
    }

    if (input.manifestCoverage !== undefined && input.manifestCoverage < 0.5) {
      steps.push({
        order: order++,
        operation: 'add_manifest',
        description: 'Provide an ecosystem manifest to improve dependency mapping confidence',
        estimated_cost_stroops: 0,
        estimated_time_minutes: 10,
      });
    }

    if (input.blastRadius !== undefined && input.blastRadius >= 50) {
      steps.push({
        order: order++,
        operation: 'review_scope',
        description: 'Review critical contracts and reduce transaction blast radius',
        estimated_cost_stroops: 0,
        estimated_time_minutes: 15,
      });
    }

    if (input.ttlWarnings?.some((warning) => warning.severity === 'WARNING')) {
      steps.push({
        order: order++,
        operation: 'extend_ttl',
        description: 'Extend TTL on ledger entries nearing archival expiry',
        estimated_cost_stroops: 200,
        estimated_time_minutes: 10,
      });
    }
  }

  if (input.verdict === 'ABORT' && input.failureErrorCode !== 'AUTH_REQUIRED') {
    steps.push({
      order: order++,
      operation: 'fix_auth',
      description: 'Verify authorization credentials if auth may be contributing to failure',
      estimated_cost_stroops: 100,
      estimated_time_minutes: 10,
    });
  }

  steps.push({
    order: order++,
    operation: 'resimulate',
    description: 'Re-run MERIDIAN analysis after applying fixes',
    estimated_cost_stroops: 0,
    estimated_time_minutes: 2,
  });

  return steps;
}

/**
 * Run full MERIDIAN analysis pipeline (TRACE → FIELD → GRAVITY).
 * BRIEF synthesis is handled by @meridian/ai.
 *
 * @param request - Analyze request with transaction XDR and options
 * @returns Partial AnalyzeResponse (without brief) or MeridianError
 */
export async function analyze(
  request: AnalyzeRequest,
): Promise<Omit<AnalyzeResponse, 'brief'> | MeridianError> {
  const startMs = Date.now();
  const threshold = request.options?.confidence_threshold ?? DEFAULT_CONFIDENCE_THRESHOLD;

  logger.info('analyze:start', { network: request.network });

  const traceStartedAt = Date.now();
  const traceResult = await trace(request.tx, {
    network: request.network,
    rpcUrl: request.options?.rpc_url,
    authMode: request.options?.auth_mode ?? 'enforce',
  });
  const traceMs = Date.now() - traceStartedAt;

  if ('layer' in traceResult) {
    return traceResult;
  }

  const context: SimulationContext = {
    ...traceResult.simulation_context,
    footprintContracts: [
      ...new Set([
        ...traceResult.simulation_context.footprintContracts,
        ...extractFootprintContracts(traceResult),
      ]),
    ],
  };

  const fieldStartedAt = Date.now();
  const fieldResult = request.options?.skip_field
    ? emptyFieldResult()
    : await buildFieldGraph(traceResult, context, {
        network: request.network,
        manifest: request.ecosystem,
        rpcUrl: request.options?.rpc_url,
        authMode: request.options?.field_auth_mode,
        deepDiscovery: request.options?.deep_discovery,
        txXdr: request.tx,
      });
  const fieldMs = Date.now() - fieldStartedAt;

  const gravityStartedAt = Date.now();
  const gravityResult = request.options?.skip_gravity
    ? emptyGravityResult()
    : scoreGravity(traceResult, fieldResult, { manifest: request.ecosystem });
  const gravityMs = Date.now() - gravityStartedAt;

  const isStale = traceResult.staleness_warning ?? false;
  const confidence = computeConfidence(
    traceResult.success,
    fieldResult.manifest_coverage,
    isStale,
  );

  const { verdict } = computeVerdict(
    traceResult.success,
    gravityResult.blast_radius,
    confidence,
    threshold,
    isStale,
  );

  const warnings: string[] = [];
  if (isStale) warnings.push('Simulation ledger is stale (>5 ledgers behind latest)');
  if (confidence < threshold) {
    warnings.push(`Confidence ${confidence} is below threshold ${threshold}`);
  }
  if (fieldResult.ttl_warnings.length > 0) {
    warnings.push(`${fieldResult.ttl_warnings.length} TTL warning(s) detected on footprint entries`);
  }

  const fixSequence = generateFixSequence({
    verdict,
    traceSuccess: traceResult.success,
    warnings,
    failureRootCause: traceResult.failure_point?.root_cause,
    failureErrorCode: traceResult.failure_point?.error_code,
    ttlWarnings: fieldResult.ttl_warnings,
    blastRadius: gravityResult.blast_radius,
    manifestCoverage: fieldResult.manifest_coverage,
  });

  const explainability = buildExplainabilityReport(
    traceResult,
    fieldResult,
    gravityResult,
    request.ecosystem,
  );
  const unmappedContracts = countUnmappedContracts(fieldResult, request.ecosystem);
  const confidenceBucket = getConfidenceBucket(confidence);

  return {
    product: 'MERIDIAN',
    version: MERIDIAN_VERSION,
    verdict,
    confidence,
    trace: traceResult,
    field: fieldResult,
    gravity: gravityResult,
    explainability,
    fix_sequence: fixSequence,
    warnings: warnings.length > 0 ? warnings : undefined,
    meta: {
      analyzed_at: new Date().toISOString(),
      ledger_sequence: context.ledgerSequence,
      simulation_stale: isStale,
      network: request.network,
      processing_ms: Date.now() - startMs,
      layer_timings_ms: {
        trace: traceMs,
        field: fieldMs,
        gravity: gravityMs,
      },
      unmapped_contracts: unmappedContracts,
      confidence_bucket: confidenceBucket,
    },
  };
}

/**
 * Extract contract addresses from trace execution path.
 *
 * @param trace - TRACE result
 * @returns Contract addresses
 */
function extractFootprintContracts(trace: { execution_path: { contract_id?: string }[] }): string[] {
  const contracts = new Set<string>();
  for (const step of trace.execution_path) {
    if (step.contract_id) contracts.add(step.contract_id);
  }
  return [...contracts];
}

function countUnmappedContracts(
  fieldResult: { dependency_graph: { address: string }[] },
  manifest?: AnalyzeRequest['ecosystem'],
): number {
  if (!manifest) return fieldResult.dependency_graph.length;
  const knownContracts = new Set(manifest.contracts.map((contract) => contract.address));
  return fieldResult.dependency_graph.filter((node) => !knownContracts.has(node.address)).length;
}

function getConfidenceBucket(confidence: number): ConfidenceBucket {
  if (confidence < 0.5) return 'LOW';
  if (confidence < 0.75) return 'MEDIUM';
  return 'HIGH';
}

function emptyFieldResult() {
  return {
    contracts_mapped: 0,
    dependency_graph: [],
    ttl_warnings: [],
    manifest_coverage: 0,
  };
}

function emptyGravityResult() {
  return {
    blast_radius: 0,
    score_breakdown: {
      formula: 'blast_radius = sum(contract_scores) / total_contracts, capped at 100',
      total_contracts: 0,
      total_weighted_score: 0,
      normalized_score: 0,
      contributions: [],
    },
    affected_contracts: [],
    critical: [],
    warning: [],
    safe: [],
    monitor: [],
    total_affected_users: 0,
    recovery: 'FULL' as const,
  };
}
