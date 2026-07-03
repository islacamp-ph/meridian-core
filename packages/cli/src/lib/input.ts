import { readFile } from 'node:fs/promises';

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
