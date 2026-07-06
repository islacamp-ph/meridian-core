import { rpc, SorobanDataBuilder, TransactionBuilder, Networks, xdr } from '@stellar/stellar-sdk';
import { classifyStellarError } from '../errors.js';
import { logger } from '../logger.js';
import type { MeridianError } from '../types.js';

const DEFAULT_TIMEOUT_MS = 30_000;

export interface RawSimulationResult {
  success: boolean;
  latestLedger: number;
  simulationLedger: number;
  minResourceFee: string;
  events: xdr.DiagnosticEvent[];
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

    const latestLedgerResponse = await withTimeout(
      server.getLatestLedger(),
      timeoutMs,
      'getLatestLedger',
    );

    const transaction = TransactionBuilder.fromXDR(
      txXdr,
      Networks.TESTNET, // network passphrase resolved during parse; RPC validates
    );

    const simResponse = await withTimeout(
      server.simulateTransaction(transaction),
      timeoutMs,
      'simulateTransaction',
    );

    if (rpc.Api.isSimulationError(simResponse)) {
      return {
        success: false,
        latestLedger: latestLedgerResponse.sequence,
        simulationLedger: latestLedgerResponse.sequence,
        minResourceFee: '0',
        events: simResponse.events,
        error: simResponse.error,
      };
    }

    return {
      success: true,
      latestLedger: latestLedgerResponse.sequence,
      simulationLedger: latestLedgerResponse.sequence,
      minResourceFee: simResponse.minResourceFee,
      events: simResponse.events ?? [],
      sorobanData: simResponse.transactionData,
    };
  } catch (err) {
    logger.error('simulateTransaction:failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return classifyStellarError(err instanceof Error ? err : String(err), 'TRACE');
  }
}
