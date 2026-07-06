import { readFile } from 'node:fs/promises';
import type { BatchAnalyzeItemRequest, Network } from '../internal/meridian-core.js';

/**
 * Read all data from stdin as a UTF-8 string.
 *
 * @returns Trimmed stdin contents
 */
async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf-8').trim();
}

/**
 * Resolve the transaction XDR from a positional argument, a file path, or stdin.
 * Precedence: --file > positional arg > stdin.
 *
 * @param txArg - Positional tx argument, if provided
 * @param filePath - Path to a file containing the base64 XDR, if provided
 * @returns Trimmed base64-encoded transaction XDR
 * @throws If no XDR could be resolved from any source
 */
export async function resolveTxInput(txArg?: string, filePath?: string): Promise<string> {
  if (filePath) {
    const contents = await readFile(filePath, 'utf-8');
    return contents.trim();
  }

  if (txArg && txArg.trim().length > 0) {
    return txArg.trim();
  }

  if (!process.stdin.isTTY) {
    const fromStdin = await readStdin();
    if (fromStdin.length > 0) return fromStdin;
  }

  throw new Error(
    'No transaction XDR provided. Pass it as an argument, via --file <path>, or pipe it over stdin.',
  );
}

export type ResolvedAnalyzeInput =
  | { kind: 'single'; tx: string }
  | { kind: 'batch'; items: BatchAnalyzeItemRequest[] };

/**
 * Resolve either a single transaction XDR or a batch analyze file.
 * Batch mode is enabled only when --file points to JSON containing an array of
 * transactions or an object with an `items` array.
 */
export async function resolveAnalyzeInput(
  txArg: string | undefined,
  filePath: string | undefined,
  defaultNetwork: Network,
): Promise<ResolvedAnalyzeInput> {
  if (!filePath) {
    return { kind: 'single', tx: await resolveTxInput(txArg, undefined) };
  }

  const contents = await readFile(filePath, 'utf-8');
  const batchItems = parseBatchAnalyzeFile(contents, defaultNetwork);
  if (batchItems) {
    return { kind: 'batch', items: batchItems };
  }

  return { kind: 'single', tx: contents.trim() };
}

export function parseBatchAnalyzeFile(
  contents: string,
  defaultNetwork: Network,
): BatchAnalyzeItemRequest[] | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(contents);
  } catch {
    return null;
  }

  if (Array.isArray(parsed)) {
    return parsed.map((item, index) => normalizeBatchItem(item, index, defaultNetwork));
  }

  if (isBatchObject(parsed)) {
    const fileDefaultNetwork = parsed.default_network ?? defaultNetwork;
    return parsed.items.map((item, index) => normalizeBatchItem(item, index, fileDefaultNetwork));
  }

  return null;
}

function isBatchObject(value: unknown): value is {
  items: unknown[];
  default_network?: Network;
} {
  return typeof value === 'object' && value !== null && 'items' in value && Array.isArray((value as { items: unknown[] }).items);
}

function normalizeBatchItem(
  value: unknown,
  index: number,
  defaultNetwork: Network,
): BatchAnalyzeItemRequest {
  if (typeof value === 'string') {
    return {
      id: `tx-${index + 1}`,
      tx: value.trim(),
      network: defaultNetwork,
    };
  }

  if (typeof value !== 'object' || value === null || !('tx' in value)) {
    throw new Error('Batch analyze files must contain an array of XDR strings or objects with a tx field.');
  }

  const candidate = value as { id?: unknown; tx?: unknown; network?: unknown };
  if (typeof candidate.tx !== 'string' || candidate.tx.trim().length === 0) {
    throw new Error('Each batch analyze item must include a non-empty tx string.');
  }

  const network = candidate.network === 'mainnet' || candidate.network === 'testnet'
    ? candidate.network
    : defaultNetwork;

  return {
    id: typeof candidate.id === 'string' && candidate.id.trim().length > 0 ? candidate.id.trim() : `tx-${index + 1}`,
    tx: candidate.tx.trim(),
    network,
  };
}
