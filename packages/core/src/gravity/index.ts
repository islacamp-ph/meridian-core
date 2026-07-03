import { logger } from '../logger.js';
import type {
  ContractImpact,
  EcosystemManifest,
  FieldResult,
  GravityOptions,
  GravityResult,
  ImpactLevel,
  TraceResult,
} from '../types.js';

/**
 * Score blast radius from TRACE + FIELD results.
 * Phase 1: footprint-based scoring with manifest enrichment.
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
  const affectedContracts: ContractImpact[] = [];
  const critical: string[] = [];
  const warning: string[] = [];
  const safe: string[] = [];
  const monitor: string[] = [];

  for (const node of field.dependency_graph) {
    const manifestEntry = manifestLookup.get(node.address);
    let impact: ImpactLevel = 'SAFE';
    let reason = 'Read-only dependency';

    if (!trace.success) {
      const failedContract = trace.failure_point?.contract_id;
      if (failedContract === node.address) {
        impact = 'CRITICAL';
        reason = trace.failure_point?.root_cause ?? 'Direct failure point';
        critical.push(node.address);
      } else if (node.dependencies.length > 0) {
        impact = 'MONITOR';
        reason = 'Indirect dependency of failed contract';
        monitor.push(node.address);
      } else {
        safe.push(node.address);
      }
    } else {
      const hasWrite = trace.execution_path.some(
        (s) => s.contract_id === node.address && s.type === 'invoke',
      );
      if (hasWrite) {
        impact = 'WARNING';
        reason = 'Contract receives state writes';
        warning.push(node.address);
      } else {
        safe.push(node.address);
      }
    }

    affectedContracts.push({
      address: node.address,
      name: manifestEntry?.name ?? node.name,
      impact,
      active_users: manifestEntry?.active_users,
      reason,
    });
  }

  const totalAffectedUsers = affectedContracts.reduce(
    (sum, c) => sum + (c.active_users ?? 0),
    0,
  );

  const blastRadius = computeBlastRadius(critical.length, warning.length, field.contracts_mapped);
  const recovery = critical.length > 0 ? 'PARTIAL' : 'FULL';

  return {
    blast_radius: blastRadius,
    affected_contracts: affectedContracts,
    critical,
    warning,
    safe,
    monitor,
    total_affected_users: totalAffectedUsers,
    recovery,
  };
}

/**
 * Build manifest lookup for gravity scoring.
 *
 * @param manifest - Optional ecosystem manifest
 * @returns Map of address to manifest contract metadata
 */
function buildManifestLookup(
  manifest?: EcosystemManifest,
): Map<string, { name: string; active_users?: number }> {
  const lookup = new Map<string, { name: string; active_users?: number }>();
  if (!manifest) return lookup;
  for (const c of manifest.contracts) {
    lookup.set(c.address, { name: c.name, active_users: c.active_users });
  }
  return lookup;
}

/**
 * Compute blast radius score 0-100.
 *
 * @param criticalCount - Number of critical contracts
 * @param warningCount - Number of warning contracts
 * @param totalContracts - Total contracts mapped
 * @returns Blast radius score
 */
function computeBlastRadius(
  criticalCount: number,
  warningCount: number,
  totalContracts: number,
): number {
  if (totalContracts === 0) return 0;
  const score = ((criticalCount * 40) + (warningCount * 15)) / totalContracts;
  return Math.min(100, Math.round(score * 100) / 100);
}
