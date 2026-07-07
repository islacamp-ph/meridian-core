import { createHash } from 'node:crypto';
import type { BriefInput } from './brief.js';

export const BRIEF_CACHE_TTL_MS = 300_000;

interface BriefCacheEntry {
  value: string;
  expiresAt: number;
}

const briefCache = new Map<string, BriefCacheEntry>();

/**
 * Build a stable cache key from BRIEF synthesis input.
 */
export function buildBriefCacheKey(input: BriefInput): string {
  const payload = {
    verdict: input.verdict,
    confidence: input.confidence,
    trace: {
      success: input.trace.success,
      failure_point: input.trace.failure_point,
      execution_path: input.trace.execution_path,
      auth_entries: input.trace.auth_entries,
      fee_estimate: input.trace.fee_estimate,
      staleness_warning: input.trace.staleness_warning,
      ledger_sequence: input.trace.simulation_context?.ledgerSequence,
    },
    field: {
      contracts_mapped: input.field.contracts_mapped,
      dependency_graph: input.field.dependency_graph,
      ttl_warnings: input.field.ttl_warnings,
      manifest_coverage: input.field.manifest_coverage,
    },
    gravity: {
      blast_radius: input.gravity.blast_radius,
      affected_contracts: input.gravity.affected_contracts,
      critical: input.gravity.critical,
      warning: input.gravity.warning,
      total_affected_users: input.gravity.total_affected_users,
      recovery: input.gravity.recovery,
    },
    fix_sequence: input.fix_sequence,
    warnings: input.warnings,
  };

  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

/**
 * Read a cached BRIEF if present and not expired.
 */
export function getCachedBrief(key: string): string | undefined {
  const entry = briefCache.get(key);
  if (!entry) return undefined;
  if (Date.now() >= entry.expiresAt) {
    briefCache.delete(key);
    return undefined;
  }
  return entry.value;
}

/**
 * Store a BRIEF in the in-memory cache.
 */
export function setCachedBrief(
  key: string,
  value: string,
  ttlMs: number = BRIEF_CACHE_TTL_MS,
): void {
  briefCache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

/**
 * Clear all cached BRIEF entries (for tests).
 */
export function clearBriefCache(): void {
  briefCache.clear();
}
