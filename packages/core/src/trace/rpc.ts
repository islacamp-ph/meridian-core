import { rpc, SorobanDataBuilder, TransactionBuilder, Networks, xdr } from '@stellar/stellar-sdk';
import { classifyStellarError } from '../errors.js';
import { logger } from '../logger.js';
import type { MeridianError, RpcMetrics } from '../types.js';

const DEFAULT_TIMEOUT_MS = 30_000;

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

/**
 * Call Stellar simulateTransaction RPC with timeout and error classification.
 *
 * @param txXdr - Base64-encoded transaction XDR
 * @param rpcUrl - Soroban RPC endpoint URL
 * @param timeoutMs - Request timeout in milliseconds
 * @returns Raw simulation result or MeridianError
 */
export async function simulateTransaction(
  txXdr: string,
  rpcUrl: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<RawSimulationResult | MeridianError> {
  const server = new rpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith('http://') });

  try {
    logger.debug('simulateTransaction:start', { rpcUrl });

    const transaction = TransactionBuilder.fromXDR(
      txXdr,
      Networks.TESTNET, // network passphrase resolved during parse; RPC validates
    );

    const simulateStartedAt = Date.now();
    const simResponse = await withTimeout(
      server.simulateTransaction(transaction),
      timeoutMs,
      'simulateTransaction',
    );
    const simulateTransactionMs = Date.now() - simulateStartedAt;

    if (rpc.Api.isSimulationError(simResponse)) {
      const simulationLedger = simResponse.latestLedger;
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
        success: false,
        ...rpcMetrics,
      });

      return {
        success: false,
        latestLedger: latestLedger.sequence,
        simulationLedger,
        minResourceFee: '0',
        events: simResponse.events ?? [],
        rpcMetrics,
        error: simResponse.error,
      };
    }

    const simulationLedger = simResponse.latestLedger;
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
      success: true,
      ...rpcMetrics,
    });

    return {
      success: true,
      latestLedger: latestLedger.sequence,
      simulationLedger,
      minResourceFee: simResponse.minResourceFee,
      events: simResponse.events ?? [],
      rpcMetrics,
      sorobanData: simResponse.transactionData,
    };
  } catch (err) {
    logger.error('simulateTransaction:failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return classifyStellarError(err instanceof Error ? err : String(err), 'TRACE');
  }
}
