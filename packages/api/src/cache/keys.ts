import { createHash } from 'node:crypto';
import type { Network, Verdict } from '@meridian/core';

export type CacheLayer = 'trace' | 'field' | 'gravity' | 'analyze';

export const CACHE_TTL_MS: Record<CacheLayer, number> = {
  trace: 60_000,
  field: 300_000,
  gravity: 60_000,
  analyze: 300_000,
};

export const LEDGER_STALE_THRESHOLD = 10;
export const MAINNET_CLEAR_MAX_AGE_MS = 30_000;

export interface CacheEnvelope<T> {
  data: T;
  cachedAt: number;
  ledgerSequence: number;
  network: Network;
  verdict?: Verdict;
}

export function buildCacheKey(
  layer: CacheLayer,
  network: Network,
  txXdr: string,
  suffix = '',
): string {
  const txHash = createHash('sha256').update(txXdr).digest('hex').slice(0, 16);
  const parts = ['meridian', layer, network, txHash];
  if (suffix) parts.push(suffix);
  return parts.join(':');
}

export function isCacheEntryValid<T>(
  entry: CacheEnvelope<T>,
  currentLedgerSequence?: number,
): boolean {
  if (
    currentLedgerSequence !== undefined &&
    currentLedgerSequence - entry.ledgerSequence > LEDGER_STALE_THRESHOLD
  ) {
    return false;
  }

  if (
    entry.network === 'mainnet' &&
    entry.verdict === 'CLEAR' &&
    Date.now() - entry.cachedAt > MAINNET_CLEAR_MAX_AGE_MS
  ) {
    return false;
  }

  return true;
}
