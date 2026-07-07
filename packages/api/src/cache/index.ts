import { createClient, type RedisClientType } from 'redis';
import type { Network, Verdict } from '@meridian/core';
import {
  type CacheEnvelope,
  type CacheLayer,
  CACHE_TTL_MS,
  buildCacheKey,
  isCacheEntryValid,
} from './keys.js';

const memoryStore = new Map<string, string>();

let redisClient: RedisClientType | null = null;
let redisConnectPromise: Promise<RedisClientType | null> | null = null;

async function getRedisClient(): Promise<RedisClientType | null> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return null;

  if (redisClient?.isOpen) return redisClient;

  if (!redisConnectPromise) {
    redisConnectPromise = (async () => {
      const client = createClient({ url: redisUrl });
      client.on('error', () => {
        // Fall back to memory when Redis is unavailable.
      });
      try {
        await client.connect();
        redisClient = client as RedisClientType;
        return redisClient;
      } catch {
        redisConnectPromise = null;
        return null;
      }
    })();
  }

  return redisConnectPromise;
}

async function readRaw(key: string): Promise<string | undefined> {
  const client = await getRedisClient();
  if (client) {
    const value = await client.get(key);
    return value ?? undefined;
  }
  return memoryStore.get(key);
}

async function writeRaw(key: string, value: string, ttlMs: number): Promise<void> {
  const client = await getRedisClient();
  if (client) {
    await client.set(key, value, { PX: ttlMs });
    return;
  }
  memoryStore.set(key, value);
  setTimeout(() => memoryStore.delete(key), ttlMs).unref?.();
}

/**
 * Read a cached layer result when still valid for the current ledger.
 */
export async function getCachedLayerResult<T>(
  layer: CacheLayer,
  network: Network,
  txXdr: string,
  currentLedgerSequence?: number,
  suffix = '',
): Promise<T | undefined> {
  const key = buildCacheKey(layer, network, txXdr, suffix);
  const raw = await readRaw(key);
  if (!raw) return undefined;

  try {
    const envelope = JSON.parse(raw) as CacheEnvelope<T>;
    if (!isCacheEntryValid(envelope, currentLedgerSequence)) {
      return undefined;
    }
    return envelope.data;
  } catch {
    return undefined;
  }
}

/**
 * Store a layer result in Redis (or in-memory fallback).
 */
export async function setCachedLayerResult<T>(
  layer: CacheLayer,
  network: Network,
  txXdr: string,
  ledgerSequence: number,
  data: T,
  options?: { verdict?: Verdict; suffix?: string },
): Promise<void> {
  const envelope: CacheEnvelope<T> = {
    data,
    cachedAt: Date.now(),
    ledgerSequence,
    network,
    verdict: options?.verdict,
  };

  const key = buildCacheKey(layer, network, txXdr, options?.suffix ?? '');
  await writeRaw(key, JSON.stringify(envelope), CACHE_TTL_MS[layer]);
}

/**
 * Clear in-memory cache entries (for tests).
 */
export function clearMemoryCache(): void {
  memoryStore.clear();
}

/**
 * Disconnect Redis client (for tests).
 */
export async function disconnectCache(): Promise<void> {
  if (redisClient?.isOpen) {
    await redisClient.quit();
  }
  redisClient = null;
  redisConnectPromise = null;
  memoryStore.clear();
}

export {
  buildCacheKey,
  CACHE_TTL_MS,
  isCacheEntryValid,
  LEDGER_STALE_THRESHOLD,
  MAINNET_CLEAR_MAX_AGE_MS,
} from './keys.js';
export type { CacheEnvelope, CacheLayer } from './keys.js';
