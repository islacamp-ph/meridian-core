import {
  rpc,
  SorobanDataBuilder,
  xdr,
  type FeeBumpTransaction,
  type Transaction,
} from '@stellar/stellar-sdk';
import { classifyStellarError } from '../errors.js';
import { logger } from '../logger.js';
import type { LedgerEntryTTL, MeridianError, Network, RpcMetrics, SimulationAuthMode } from '../types.js';
import { parseTransactionFromXdr } from './network.js';

const DEFAULT_TIMEOUT_MS = 30_000;
/** Soroban RPC getLedgerEntries batch size (keys per request). */
const LEDGER_ENTRY_BATCH_SIZE = 100;

export interface RawSimulationResult {
  success: boolean;
  latestLedger: number;
  simulationLedger: number;
  minResourceFee: string;
  events: xdr.DiagnosticEvent[];
  rpcMetrics: RpcMetrics;
  error?: string;
  /** Parsed Soroban resource/footprint data, present only on a successful simulation. */
  sorobanData?: SorobanDataBuilder;
  /** Memory bytes from simulation cost (memBytes), when reported by RPC. */
  memoryBytes?: number;
}

export interface SimulateTransactionOptions {
  network?: Network;
  authMode?: SimulationAuthMode;
  timeoutMs?: number;
}

interface RawSimulateRpcResponse {
  id: string;
  latestLedger: number;
  error?: string;
  transactionData?: string;
  events?: string[];
  minResourceFee?: string;
  results?: Array<{ auth?: string[]; xdr?: string }>;
  cost?: {
    cpuInsns?: string;
    memBytes?: string;
  };
}

/**
 * Resolve Stellar RPC URL from environment for the given network.
 *
 * @param network - Target Stellar network
 * @returns RPC endpoint URL
 */
export function resolveRpcUrl(network: 'mainnet' | 'testnet'): string {
  const envKey = network === 'mainnet' ? 'STELLAR_RPC_MAINNET' : 'STELLAR_RPC_TESTNET';
  const url = process.env[envKey];
  if (!url) {
    throw new Error(`Missing environment variable: ${envKey}`);
  }
  return url;
}

/**
 * Wrap an async operation with a timeout.
 *
 * @param promise - Promise to wrap
 * @param timeoutMs - Timeout in milliseconds
 * @param label - Label for timeout error message
 * @returns Result of the promise
 */
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout: ${label} exceeded ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

async function getLatestLedgerSequence(
  server: rpc.Server,
  timeoutMs: number,
  fallbackLedger: number,
): Promise<{ sequence: number; elapsedMs: number; usedFallback: boolean; timedOut: boolean }> {
  const startedAt = Date.now();
  try {
    const latestLedgerResponse = await withTimeout(
      server.getLatestLedger(),
      timeoutMs,
      'getLatestLedger',
    );
    return {
      sequence: latestLedgerResponse.sequence,
      elapsedMs: Date.now() - startedAt,
      usedFallback: false,
      timedOut: false,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const timedOut = message.includes('timeout:');
    logger.warn('simulateTransaction:getLatestLedger:failed', {
      error: message,
      fallbackLedger,
      timedOut,
      elapsedMs: Date.now() - startedAt,
    });
    return {
      sequence: fallbackLedger,
      elapsedMs: Date.now() - startedAt,
      usedFallback: true,
      timedOut,
    };
  }
}

function createRpcServer(rpcUrl: string): rpc.Server {
  return new rpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith('http://') });
}

async function postSimulateTransaction(
  rpcUrl: string,
  transaction: Transaction | FeeBumpTransaction,
  authMode?: SimulationAuthMode,
): Promise<RawSimulateRpcResponse> {
  const params: Record<string, unknown> = {
    transaction: transaction.toXDR(),
  };
  if (authMode) {
    params.authMode = authMode;
  }

  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'simulateTransaction',
      params,
    }),
  });

  if (!response.ok) {
    throw new Error(`RPC simulateTransaction failed: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as {
    result?: RawSimulateRpcResponse;
    error?: { message?: string };
  };

  if (payload.error) {
    throw new Error(payload.error.message ?? 'RPC simulateTransaction error');
  }
  if (!payload.result) {
    throw new Error('RPC simulateTransaction returned no result');
  }

  return payload.result;
}

function parseRawSimulation(raw: RawSimulateRpcResponse): {
  success: boolean;
  error?: string;
  sorobanData?: SorobanDataBuilder;
  minResourceFee: string;
  events: xdr.DiagnosticEvent[];
  memoryBytes?: number;
} {
  const events = (raw.events ?? []).map((evt) => xdr.DiagnosticEvent.fromXDR(evt, 'base64'));

  if (typeof raw.error === 'string') {
    return {
      success: false,
      error: raw.error,
      minResourceFee: '0',
      events,
    };
  }

  const memoryBytes = raw.cost?.memBytes ? parseInt(raw.cost.memBytes, 10) : undefined;

  return {
    success: true,
    minResourceFee: raw.minResourceFee ?? '0',
    events,
    memoryBytes: Number.isFinite(memoryBytes) ? memoryBytes : undefined,
    sorobanData: raw.transactionData
      ? new SorobanDataBuilder(raw.transactionData)
      : undefined,
  };
}

/**
 * Call Stellar simulateTransaction RPC with timeout and error classification.
 *
 * @param txXdr - Base64-encoded transaction XDR
 * @param rpcUrl - Soroban RPC endpoint URL
 * @param options - Simulation options (network, auth mode, timeout)
 * @returns Raw simulation result or MeridianError
 */
export async function simulateTransaction(
  txXdr: string,
  rpcUrl: string,
  options: SimulateTransactionOptions | number = DEFAULT_TIMEOUT_MS,
): Promise<RawSimulationResult | MeridianError> {
  const normalizedOptions: SimulateTransactionOptions =
    typeof options === 'number' ? { timeoutMs: options } : options;
  const timeoutMs = normalizedOptions.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const network = normalizedOptions.network ?? 'testnet';
  const authMode = normalizedOptions.authMode ?? 'enforce';

  const server = createRpcServer(rpcUrl);

  try {
    logger.debug('simulateTransaction:start', { rpcUrl, network, authMode });

    const transaction = parseTransactionFromXdr(txXdr, network);

    const simulateStartedAt = Date.now();
    const rawResponse = await withTimeout(
      postSimulateTransaction(rpcUrl, transaction, authMode),
      timeoutMs,
      'simulateTransaction',
    );
    const simulateTransactionMs = Date.now() - simulateStartedAt;
    const parsed = parseRawSimulation(rawResponse);
    const simulationLedger = rawResponse.latestLedger;

    const latestLedger = await getLatestLedgerSequence(server, timeoutMs, simulationLedger);
    const rpcMetrics: RpcMetrics = {
      simulate_transaction_ms: simulateTransactionMs,
      get_latest_ledger_ms: latestLedger.elapsedMs,
      latest_ledger_fallback: latestLedger.usedFallback,
      latest_ledger_timed_out: latestLedger.timedOut,
      timeout_ms: timeoutMs,
    };

    logger.info('simulateTransaction:complete', {
      rpcUrl,
      network,
      authMode,
      success: parsed.success,
      ...rpcMetrics,
    });

    if (!parsed.success) {
      return {
        success: false,
        latestLedger: latestLedger.sequence,
        simulationLedger,
        minResourceFee: '0',
        events: parsed.events,
        rpcMetrics,
        error: parsed.error,
      };
    }

    return {
      success: true,
      latestLedger: latestLedger.sequence,
      simulationLedger,
      minResourceFee: parsed.minResourceFee,
      events: parsed.events,
      rpcMetrics,
      sorobanData: parsed.sorobanData,
      memoryBytes: parsed.memoryBytes,
    };
  } catch (err) {
    logger.error('simulateTransaction:failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return classifyStellarError(err instanceof Error ? err : String(err), 'TRACE');
  }
}

/**
 * Fetch TTL metadata for ledger keys via getLedgerEntries RPC.
 *
 * @param rpcUrl - Soroban RPC endpoint URL
 * @param ledgerKeys - Base64-encoded XDR ledger keys
 * @param timeoutMs - Request timeout in milliseconds
 * @returns TTL metadata per ledger key
 */
/**
 * Fetch TTL metadata for a single batch of ledger keys.
 */
async function fetchLedgerEntryTTLBatch(
  server: rpc.Server,
  ledgerKeys: string[],
  timeoutMs: number,
): Promise<LedgerEntryTTL[]> {
  const keys = ledgerKeys.map((key) => xdr.LedgerKey.fromXDR(key, 'base64'));
  const response = await withTimeout(
    server.getLedgerEntries(...keys),
    timeoutMs,
    'getLedgerEntries',
  );

  return response.entries.map((entry) => ({
    ledger_key: entry.key.toXDR('base64'),
    live_until_ledger_seq: entry.liveUntilLedgerSeq,
  }));
}

export async function fetchLedgerEntryTTLs(
  rpcUrl: string,
  ledgerKeys: string[],
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<LedgerEntryTTL[]> {
  if (ledgerKeys.length === 0) return [];

  const server = createRpcServer(rpcUrl);
  const uniqueKeys = [...new Set(ledgerKeys)];
  const results: LedgerEntryTTL[] = [];

  for (let offset = 0; offset < uniqueKeys.length; offset += LEDGER_ENTRY_BATCH_SIZE) {
    const batch = uniqueKeys.slice(offset, offset + LEDGER_ENTRY_BATCH_SIZE);
    try {
      const batchResults = await fetchLedgerEntryTTLBatch(server, batch, timeoutMs);
      results.push(...batchResults);
    } catch (err) {
      logger.warn('fetchLedgerEntryTTLs:batch_failed', {
        batchIndex: Math.floor(offset / LEDGER_ENTRY_BATCH_SIZE),
        batchSize: batch.length,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return results;
}

/**
 * Fetch on-chain WASM hash for a contract, when available.
 *
 * @param rpcUrl - Soroban RPC endpoint URL
 * @param contractId - Contract address (C... strkey)
 * @param timeoutMs - Request timeout in milliseconds
 * @returns Hex-encoded WASM hash or undefined
 */
export async function fetchContractWasmHash(
  rpcUrl: string,
  contractId: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<string | undefined> {
  const server = createRpcServer(rpcUrl);
  try {
    const wasm = await withTimeout(
      server.getContractWasmByContractId(contractId),
      timeoutMs,
      'getContractWasmByContractId',
    );
    const { createHash } = await import('node:crypto');
    return createHash('sha256').update(wasm).digest('hex');
  } catch (err) {
    logger.debug('fetchContractWasmHash:failed', {
      contractId,
      error: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
}
