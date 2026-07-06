import { logger } from '../logger.js';
import type {
  ContractImpact,
  EcosystemManifest,
  FieldResult,
  GravityContractScoreBreakdown,
  GravityFactor,
  GravityOptions,
  GravityResult,
  GravityScoreBreakdown,
  ImpactLevel,
  TraceResult,
} from '../types.js';

const IMPACT_THRESHOLDS = {
  CRITICAL: 60,
  WARNING: 30,
  MONITOR: 10,
} as const;

const SCORE_FORMULA = 'blast_radius = sum(contract_scores) / total_contracts, capped at 100';

/**
 * Score blast radius from TRACE + FIELD results using evidence-based factors.
 *
 * @param trace - TRACE result
 * @param field - FIELD result
 * @param options - Gravity options including optional manifest
 * @returns Structured GravityResult
 */
export function scoreGravity(
  trace: TraceResult,
  field: FieldResult,
  options?: GravityOptions,
): GravityResult {
  logger.info('gravity:start', { contracts: field.contracts_mapped });

  const manifest = options?.manifest;
  const manifestLookup = buildManifestLookup(manifest);
  const directlyTouched = new Set(
    trace.execution_path.map((step) => step.contract_id).filter((value): value is string => Boolean(value)),
  );
  const authCriticalContracts = new Set(
    trace.auth_entries
      .flatMap((entry) => [entry.contract_id, entry.address])
      .filter((value): value is string => Boolean(value)),
  );
  const footprintContracts = new Set(trace.simulation_context.footprintContracts);
  const failedContract = trace.failure_point?.contract_id;

  const affectedContracts: ContractImpact[] = field.dependency_graph.map((node) => {
    const manifestEntry = manifestLookup.get(node.address);
    const breakdown = scoreContract({
      address: node.address,
      depth: node.depth,
      traceSuccess: trace.success,
      failedContract,
      directlyTouched: directlyTouched.has(node.address),
      hasWriteAccess: hasWriteAccess(trace, node.address),
      hasReadAccess: footprintContracts.has(node.address),
      authCritical: authCriticalContracts.has(node.address),
      criticality: manifestEntry?.criticality,
      activeUsers: manifestEntry?.active_users,
      role: manifestEntry?.role,
    });

    return {
      address: node.address,
      name: manifestEntry?.name ?? node.name,
      impact: classifyImpact(breakdown.total, trace.success),
      active_users: manifestEntry?.active_users,
      score: breakdown.total,
      reason: summarizeFactors(breakdown.factors),
      score_breakdown: breakdown,
    };
  });

  const critical = affectedContracts.filter((contract) => contract.impact === 'CRITICAL').map((contract) => contract.address);
  const warning = affectedContracts.filter((contract) => contract.impact === 'WARNING').map((contract) => contract.address);
  const safe = affectedContracts.filter((contract) => contract.impact === 'SAFE').map((contract) => contract.address);
  const monitor = affectedContracts.filter((contract) => contract.impact === 'MONITOR').map((contract) => contract.address);

  const totalAffectedUsers = affectedContracts
    .filter((contract) => contract.impact !== 'SAFE')
    .reduce((sum, contract) => sum + (contract.active_users ?? 0), 0);

  const scoreBreakdown = computeBlastRadius(field.contracts_mapped, affectedContracts);
  const recovery = critical.length > 0 ? 'PARTIAL' : 'FULL';

  return {
    blast_radius: scoreBreakdown.normalized_score,
    score_breakdown: scoreBreakdown,
    affected_contracts: affectedContracts,
    critical,
    warning,
    safe,
    monitor,
    total_affected_users: totalAffectedUsers,
    recovery,
  };
}

function buildManifestLookup(
  manifest?: EcosystemManifest,
): Map<string, { name: string; active_users?: number; criticality?: 'HIGH' | 'MEDIUM' | 'LOW'; role?: string }> {
  const lookup = new Map<string, { name: string; active_users?: number; criticality?: 'HIGH' | 'MEDIUM' | 'LOW'; role?: string }>();
  if (!manifest) return lookup;
  for (const contract of manifest.contracts) {
    lookup.set(contract.address, {
      name: contract.name,
      active_users: contract.active_users,
      criticality: contract.criticality,
      role: contract.role,
    });
  }
  return lookup;
}

function hasWriteAccess(trace: TraceResult, address: string): boolean {
  return trace.execution_path.some(
    (step) => step.contract_id === address && (step.type === 'invoke' || step.type === 'write'),
  );
}

function scoreContract(input: {
  address: string;
  depth: number;
  traceSuccess: boolean;
  failedContract?: string;
  directlyTouched: boolean;
  hasWriteAccess: boolean;
  hasReadAccess: boolean;
  authCritical: boolean;
  criticality?: 'HIGH' | 'MEDIUM' | 'LOW';
  activeUsers?: number;
  role?: string;
}): GravityContractScoreBreakdown {
  const factors: GravityFactor[] = [];

  pushFactor(
    factors,
    'direct_failure_point',
    'Direct failure point',
    input.failedContract === input.address ? 45 : 0,
    input.failedContract === input.address
      ? 'Contract is the transaction failure point.'
      : 'Contract is not the direct failure point.',
  );

  pushFactor(
    factors,
    'direct_touch',
    'Directly touched by transaction',
    input.directlyTouched ? 20 : 0,
    input.directlyTouched
      ? 'Contract appears directly in the execution path.'
      : 'Contract was not directly touched in the execution path.',
  );

  pushFactor(
    factors,
    'write_access',
    'Write access',
    input.hasWriteAccess ? 20 : 0,
    input.hasWriteAccess
      ? 'Contract has write-capable execution activity.'
      : 'No write-capable execution activity detected.',
  );

  pushFactor(
    factors,
    'read_access',
    'Read access',
    input.hasReadAccess && !input.hasWriteAccess ? 8 : 0,
    input.hasReadAccess && !input.hasWriteAccess
      ? 'Contract is present in simulation footprint reads.'
      : 'No read-only footprint evidence applied.',
  );

  pushFactor(
    factors,
    'auth_critical_path',
    'Authorization critical path',
    input.authCritical ? 15 : 0,
    input.authCritical
      ? 'Contract appears in require_auth / auth-critical path.'
      : 'No auth-critical evidence detected.',
  );

  pushFactor(
    factors,
    'manifest_criticality',
    'Manifest criticality',
    criticalityWeight(input.criticality),
    input.criticality
      ? `Manifest criticality is ${input.criticality}.`
      : 'Manifest criticality not provided.',
  );

  pushFactor(
    factors,
    'active_users',
    'Active user exposure',
    activeUserWeight(input.activeUsers),
    input.activeUsers && input.activeUsers > 0
      ? `Manifest reports ${input.activeUsers} active users.`
      : 'No active user exposure provided.',
  );

  pushFactor(
    factors,
    'direct_dependency',
    'Direct dependency',
    input.depth === 1 ? 12 : 0,
    input.depth === 1
      ? 'Contract is a first-order dependency of an observed contract.'
      : 'Contract is not a first-order dependency.',
  );

  pushFactor(
    factors,
    'transitive_dependency',
    'Transitive dependency',
    input.depth >= 2 ? 6 : 0,
    input.depth >= 2
      ? 'Contract is only reached through transitive dependency traversal.'
      : 'Contract is not a transitive-only dependency.',
  );

  pushFactor(
    factors,
    'contract_role',
    'Contract role',
    roleWeight(input.role),
    input.role ? `Manifest role is ${input.role}.` : 'Manifest role not provided.',
  );

  const total = Math.round(factors.reduce((sum, factor) => sum + factor.weight, 0) * 100) / 100;
  return { total, factors };
}

function pushFactor(
  factors: GravityFactor[],
  key: GravityFactor['key'],
  label: string,
  weight: number,
  reason: string,
): void {
  factors.push({
    key,
    label,
    weight,
    applied: weight > 0,
    reason,
  });
}

function criticalityWeight(criticality?: 'HIGH' | 'MEDIUM' | 'LOW'): number {
  switch (criticality) {
    case 'HIGH':
      return 20;
    case 'MEDIUM':
      return 10;
    case 'LOW':
      return 4;
    default:
      return 0;
  }
}

function activeUserWeight(activeUsers?: number): number {
  if (!activeUsers || activeUsers <= 0) return 0;
  if (activeUsers >= 100_000) return 20;
  if (activeUsers >= 10_000) return 12;
  if (activeUsers >= 1_000) return 6;
  return 2;
}

function roleWeight(role?: string): number {
  if (!role) return 0;

  const normalized = role.toLowerCase();
  if (['bridge', 'router', 'vault', 'core'].includes(normalized)) return 15;
  if (['oracle', 'factory', 'governance'].includes(normalized)) return 12;
  if (['pool', 'token'].includes(normalized)) return 8;
  return 5;
}

function classifyImpact(score: number, traceSuccess: boolean): ImpactLevel {
  if (!traceSuccess && score >= IMPACT_THRESHOLDS.CRITICAL) return 'CRITICAL';
  if (score >= IMPACT_THRESHOLDS.WARNING) return 'WARNING';
  if (score >= IMPACT_THRESHOLDS.MONITOR) return 'MONITOR';
  return 'SAFE';
}

function summarizeFactors(factors: GravityFactor[]): string {
  const applied = factors.filter((factor) => factor.applied).sort((a, b) => b.weight - a.weight);
  if (applied.length === 0) {
    return 'No material risk factors detected.';
  }

  return applied
    .slice(0, 3)
    .map((factor) => factor.reason)
    .join(' ');
}

function computeBlastRadius(
  totalContracts: number,
  affectedContracts: ContractImpact[],
): GravityScoreBreakdown {
  const contributions = affectedContracts
    .filter((contract) => contract.score > 0)
    .map((contract) => ({
      address: contract.address,
      name: contract.name,
      impact: contract.impact,
      contract_score: contract.score,
      normalized_contribution:
        totalContracts === 0 ? 0 : Math.round((contract.score / totalContracts) * 100) / 100,
      reason: contract.reason,
      active_users: contract.active_users,
      factors: contract.score_breakdown.factors.filter((factor) => factor.applied),
    }))
    .sort((a, b) => b.contract_score - a.contract_score || a.address.localeCompare(b.address));

  const totalWeightedScore = Math.round(contributions.reduce((sum, contract) => sum + contract.contract_score, 0) * 100) / 100;
  const normalizedScore = totalContracts === 0
    ? 0
    : Math.min(100, Math.round((totalWeightedScore / totalContracts) * 100) / 100);

  return {
    formula: SCORE_FORMULA,
    total_contracts: totalContracts,
    total_weighted_score: totalWeightedScore,
    normalized_score: normalizedScore,
    contributions,
  };
}
