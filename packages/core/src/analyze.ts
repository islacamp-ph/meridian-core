import { createRequire } from 'node:module';
import { buildDecision, collectTopRisks } from './decision.js';
import { buildExplainabilityReport } from './explainability.js';
import { buildFieldGraph } from './field/index.js';
import { buildExecutionGraph, buildStateChangeSummary, collectTokenMovements } from './graph.js';
import { evaluatePathExpectation, extractInvokePath } from './path.js';
import { scoreGravity } from './gravity/index.js';
import { logger } from './logger.js';
import { evaluatePolicy } from './policy.js';
import { trace } from './trace/index.js';
import type {
  AnalyzeRequest,
  AnalyzeResponse,
  ConfidenceBucket,
  FixStep,
  MeridianError,
  RiskItem,
  SimulationContext,
  TTLWarning,
  UpgradeWarning,
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
 * Generate targeted remediations for WARN / ABORT / hold / rewrite decisions.
 */
export function generateFixSequence(input: {
  verdict: Verdict;
  decisionAction?: 'submit' | 'hold' | 'rewrite';
  traceSuccess: boolean;
  warnings?: string[];
  failureRootCause?: string;
  failureErrorCode?: string;
  failureContractId?: string;
  ttlWarnings?: TTLWarning[];
  upgradeWarnings?: UpgradeWarning[];
  blastRadius?: number;
  manifestCoverage?: number;
  topRisks?: RiskItem[];
  unknownContracts?: string[];
}): FixStep[] | undefined {
  if (
    input.verdict !== 'WARN'
    && input.verdict !== 'ABORT'
    && input.decisionAction !== 'hold'
    && input.decisionAction !== 'rewrite'
  ) {
    return undefined;
  }

  const steps: FixStep[] = [];
  let order = 1;
  const seen = new Set<string>();

  const push = (step: Omit<FixStep, 'order'>) => {
    const key = `${step.operation}:${step.contract_id ?? ''}:${step.targets?.join(',') ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    steps.push({ ...step, order: order++ });
  };

  if (input.failureErrorCode === 'ENTRY_ARCHIVED' || input.ttlWarnings?.some((w) => w.severity === 'CRITICAL')) {
    const contractId = input.failureContractId
      ?? input.ttlWarnings?.find((w) => w.severity === 'CRITICAL')?.contract_id;
    push({
      operation: 'restore_archived_entry',
      description: 'Restore archived ledger entries or extend TTL before resubmitting',
      estimated_cost_stroops: 500,
      estimated_time_minutes: 15,
      targets: ['ttl_archival', 'ENTRY_ARCHIVED'],
      contract_id: contractId,
      safer_alternative: 'Split restore/TTL-extend into a prior transaction, then resubmit the original intent.',
    });
  }

  if (input.failureErrorCode === 'AUTH_REQUIRED') {
    push({
      operation: 'fix_auth',
      description: 'Rebuild auth entries: ensure every require_auth credential is signed for this invocation',
      estimated_cost_stroops: 100,
      estimated_time_minutes: 10,
      targets: ['auth_critical_path', 'AUTH_REQUIRED'],
      contract_id: input.failureContractId,
      safer_alternative: 'Re-simulate with record auth mode, assemble auth, then enforce-mode simulate before submit.',
    });
  } else if (input.failureErrorCode === 'INSUFFICIENT_BALANCE') {
    push({
      operation: 'fund_account',
      description: 'Add sufficient balance to cover fees and operation costs',
      estimated_cost_stroops: 0,
      estimated_time_minutes: 5,
      targets: ['INSUFFICIENT_BALANCE', 'fund_exposure'],
    });
  } else if (!input.traceSuccess && input.failureErrorCode) {
    push({
      operation: 'diagnose',
      description: input.failureRootCause ?? 'Review simulation failure point and rebuild the offending operation',
      estimated_cost_stroops: 0,
      estimated_time_minutes: 5,
      targets: [input.failureErrorCode, 'direct_failure_point'],
      contract_id: input.failureContractId,
    });
  }

  if (input.ttlWarnings?.some((warning) => warning.severity === 'WARNING')) {
    const contractId = input.ttlWarnings.find((w) => w.severity === 'WARNING')?.contract_id;
    push({
      operation: 'extend_ttl',
      description: 'Extend TTL on ledger entries nearing archival expiry before submit',
      estimated_cost_stroops: 200,
      estimated_time_minutes: 10,
      targets: ['ttl_archival'],
      contract_id: contractId,
      safer_alternative: 'Submit a dedicated TTL-extend transaction first, then the original write path.',
    });
  }

  for (const upgrade of input.upgradeWarnings ?? []) {
    push({
      operation: 'pin_or_review_upgrade',
      description: `Review WASM drift on ${upgrade.name ?? upgrade.contract_id}; pin expected hash or pause until verified`,
      estimated_cost_stroops: 0,
      estimated_time_minutes: 20,
      targets: ['upgradeable_dependency'],
      contract_id: upgrade.contract_id,
      safer_alternative: 'Route via an immutable / audited dependency or wait until on-chain WASM matches the manifest.',
    });
  }

  for (const address of input.unknownContracts ?? []) {
    push({
      operation: 'allowlist_or_remove',
      description: `Remove unknown contract ${address} from the tx path or add it to the ecosystem allowlist/manifest`,
      estimated_cost_stroops: 0,
      estimated_time_minutes: 15,
      targets: ['unknown_dependency'],
      contract_id: address,
      safer_alternative: 'Rewrite the transaction to call only allowlisted contracts.',
    });
  }

  if (input.warnings?.some((warning) => warning.includes('stale'))) {
    push({
      operation: 'refresh_ledger',
      description: 'Re-simulate against the latest ledger to refresh stale simulation data',
      estimated_cost_stroops: 0,
      estimated_time_minutes: 2,
      targets: ['staleness'],
    });
  }

  if (input.manifestCoverage !== undefined && input.manifestCoverage < 0.5) {
    push({
      operation: 'add_manifest',
      description: 'Provide an ecosystem manifest so unknown deps and criticality are classified',
      estimated_cost_stroops: 0,
      estimated_time_minutes: 10,
      targets: ['unknown_dependency', 'manifest_coverage'],
    });
  }

  if (input.blastRadius !== undefined && input.blastRadius >= 50) {
    push({
      operation: 'reduce_scope',
      description: 'Reduce transaction scope: fewer writes, fewer downstream contracts, lower privilege',
      estimated_cost_stroops: 0,
      estimated_time_minutes: 15,
      targets: ['blast_radius', 'fund_exposure'],
      safer_alternative: 'Split into smaller transactions so each has a lower blast radius and separate approval.',
    });
  }

  for (const risk of (input.topRisks ?? []).slice(0, 3)) {
    if (risk.factor_key === 'slippage_sensitivity') {
      push({
        operation: 'tighten_slippage',
        description: 'Add / tighten amount bounds or deadline for price-sensitive paths',
        estimated_cost_stroops: 0,
        estimated_time_minutes: 10,
        targets: ['slippage_sensitivity'],
        contract_id: risk.contract_id,
        safer_alternative: 'Use exact-output limits or a private RFQ path instead of open slippage.',
      });
    }
    if (risk.factor_key === 'privilege_level' || risk.factor_key === 'auth_critical_path') {
      push({
        operation: 'reduce_privilege',
        description: 'Avoid admin/upgrade auth in this transaction; use least-privilege credentials',
        estimated_cost_stroops: 0,
        estimated_time_minutes: 15,
        targets: ['privilege_level', 'auth_critical_path'],
        contract_id: risk.contract_id,
        safer_alternative: 'Move admin operations to a separate, human-gated approval flow.',
      });
    }
  }

  if (input.verdict === 'ABORT' && input.failureErrorCode !== 'AUTH_REQUIRED') {
    push({
      operation: 'verify_auth',
      description: 'Verify authorization credentials if auth may be contributing to failure',
      estimated_cost_stroops: 100,
      estimated_time_minutes: 10,
      targets: ['auth_critical_path'],
    });
  }

  push({
    operation: 'resimulate',
    description: 'Re-run MERIDIAN analysis after applying remediations',
    estimated_cost_stroops: 0,
    estimated_time_minutes: 2,
    targets: ['resimulate'],
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
  if (fieldResult.upgrade_warnings.length > 0) {
    warnings.push(`${fieldResult.upgrade_warnings.length} WASM upgrade risk(s) detected against manifest`);
  }

  const policy = request.options?.policy_rules?.length
    ? evaluatePolicy({
        rules: request.options.policy_rules,
        trace: traceResult,
        field: fieldResult,
        gravity: gravityResult,
        confidence,
        manifest: request.ecosystem,
        token_movements: collectTokenMovements(traceResult),
      })
    : undefined;

  // Policy can escalate WARN/ABORT beyond simulation-only verdict
  let effectiveVerdict = verdict;
  if (policy?.effect === 'ABORT') effectiveVerdict = 'ABORT';
  else if (policy?.effect === 'WARN' && verdict === 'CLEAR') effectiveVerdict = 'WARN';

  if (policy && !policy.passed) {
    warnings.push(`Policy ${policy.effect}: ${policy.violations.length} rule violation(s)`);
  }

  const decision = buildDecision({
    verdict: effectiveVerdict,
    confidence,
    trace: traceResult,
    field: fieldResult,
    gravity: gravityResult,
    manifest: request.ecosystem,
    policyEffect: policy?.effect,
  });

  const topRisks = collectTopRisks({
    verdict: effectiveVerdict,
    confidence,
    trace: traceResult,
    field: fieldResult,
    gravity: gravityResult,
    manifest: request.ecosystem,
  }).slice(0, 3);

  const executionGraph = buildExecutionGraph(traceResult, fieldResult, request.ecosystem);
  const stateChanges = buildStateChangeSummary(traceResult, fieldResult);
  const pathExpectation = request.options?.expected_path?.length
    ? evaluatePathExpectation(
        request.options.expected_path,
        traceResult.execution_path
          .filter((step) => step.type === 'invoke' && step.contract_id)
          .map((step) => ({
            contract_id: step.contract_id!,
            function_name: step.function_name,
          })),
      )
    : undefined;

  if (pathExpectation && !pathExpectation.matched_fully) {
    warnings.push(
      `Expected path mismatch: ${pathExpectation.missing.length} missing, ${pathExpectation.unexpected.length} unexpected invoke(s)`,
    );
  }

  const knownContracts = new Set(request.ecosystem?.contracts.map((c) => c.address) ?? []);
  const unknownContracts = request.ecosystem
    ? fieldResult.dependency_graph
        .map((node) => node.address)
        .filter((address) => !knownContracts.has(address))
    : [];

  const fixSequence = generateFixSequence({
    verdict: effectiveVerdict,
    decisionAction: decision.action,
    traceSuccess: traceResult.success,
    warnings,
    failureRootCause: traceResult.failure_point?.root_cause,
    failureErrorCode: traceResult.failure_point?.error_code,
    failureContractId: traceResult.failure_point?.contract_id,
    ttlWarnings: fieldResult.ttl_warnings,
    upgradeWarnings: fieldResult.upgrade_warnings,
    blastRadius: gravityResult.blast_radius,
    manifestCoverage: fieldResult.manifest_coverage,
    topRisks,
    unknownContracts,
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
    verdict: effectiveVerdict,
    confidence,
    decision,
    execution_graph: executionGraph,
    state_changes: stateChanges,
    top_risks: topRisks,
    path_expectation: pathExpectation,
    trace: traceResult,
    field: fieldResult,
    gravity: gravityResult,
    explainability,
    fix_sequence: fixSequence,
    warnings: warnings.length > 0 ? warnings : undefined,
    policy,
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
    upgrade_warnings: [],
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
