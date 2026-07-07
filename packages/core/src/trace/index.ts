import { classifyStellarError } from '../errors.js';
import { logger } from '../logger.js';
import type { MeridianError, TraceOptions, TraceResult } from '../types.js';
import { parseSimulationResult } from './parser.js';
import { resolveRpcUrl, simulateTransaction } from './rpc.js';

export {
  parseExecutionPath,
  parseSimulationResult,
  extractFootprint,
  mergeSimulationContexts,
  checkTTLWarnings,
  enrichExecutionPath,
} from './parser.js';
export { resolveNetworkPassphrase, parseTransactionFromXdr } from './network.js';
export {
  resolveRpcUrl,
  simulateTransaction,
  fetchLedgerEntryTTLs,
  fetchContractWasmHash,
} from './rpc.js';

/**
 * Run the TRACE engine: simulate a transaction and parse the result.
 *
 * @param txXdr - Base64-encoded transaction XDR
 * @param options - Trace options including network and RPC URL
 * @returns Structured TraceResult or MeridianError
 */
export async function trace(
  txXdr: string,
  options?: Partial<TraceOptions>,
): Promise<TraceResult | MeridianError> {
  const network = options?.network ?? 'testnet';
  const rpcUrl = options?.rpcUrl ?? resolveRpcUrl(network);
  const timeoutMs = options?.timeoutMs ?? 30_000;
  const authMode = options?.authMode ?? 'enforce';

  logger.info('trace:start', { network, authMode });

  if (!txXdr || txXdr.trim().length === 0) {
    return classifyStellarError('Invalid transaction XDR: empty input', 'TRACE');
  }

  const raw = await simulateTransaction(txXdr, rpcUrl, {
    network,
    authMode,
    timeoutMs,
  });

  if ('layer' in raw) {
    return raw;
  }

  const result = parseSimulationResult(raw, txXdr, network);
  logger.info('trace:complete', { success: result.success });
  return result;
}
