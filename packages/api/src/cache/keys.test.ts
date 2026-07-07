import { describe, expect, it } from 'vitest';
import {
  buildCacheKey,
  isCacheEntryValid,
  MAINNET_CLEAR_MAX_AGE_MS,
} from './keys.js';

describe('cache keys', () => {
  it('builds stable meridian cache keys', () => {
    const key = buildCacheKey('trace', 'testnet', 'AAAA');
    expect(key).toMatch(/^meridian:trace:testnet:[a-f0-9]{16}$/);
  });

  it('invalidates when ledger advances beyond threshold', () => {
    const valid = isCacheEntryValid(
      {
        data: {},
        cachedAt: Date.now(),
        ledgerSequence: 100,
        network: 'testnet',
      },
      105,
    );
    const stale = isCacheEntryValid(
      {
        data: {},
        cachedAt: Date.now(),
        ledgerSequence: 100,
        network: 'testnet',
      },
      111,
    );

    expect(valid).toBe(true);
    expect(stale).toBe(false);
  });

  it('rejects stale mainnet CLEAR entries after 30s', () => {
    const fresh = isCacheEntryValid(
      {
        data: {},
        cachedAt: Date.now(),
        ledgerSequence: 100,
        network: 'mainnet',
        verdict: 'CLEAR',
      },
      100,
    );
    const expired = isCacheEntryValid(
      {
        data: {},
        cachedAt: Date.now() - MAINNET_CLEAR_MAX_AGE_MS - 1,
        ledgerSequence: 100,
        network: 'mainnet',
        verdict: 'CLEAR',
      },
      100,
    );

    expect(fresh).toBe(true);
    expect(expired).toBe(false);
  });
});
