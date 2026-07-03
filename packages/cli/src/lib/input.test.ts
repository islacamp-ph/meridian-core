import { describe, it, expect } from 'vitest';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveTxInput } from './input.js';

describe('resolveTxInput', () => {
  it('returns the trimmed positional argument when provided', async () => {
    const result = await resolveTxInput('  AAAA-fake-xdr  ', undefined);
    expect(result).toBe('AAAA-fake-xdr');
  });

  it('reads and trims XDR from a file when --file is provided', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'meridian-cli-'));
    const filePath = join(dir, 'tx.xdr');
    await writeFile(filePath, '  file-based-xdr\n');

    try {
      const result = await resolveTxInput(undefined, filePath);
      expect(result).toBe('file-based-xdr');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('prefers --file over the positional argument', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'meridian-cli-'));
    const filePath = join(dir, 'tx.xdr');
    await writeFile(filePath, 'from-file');

    try {
      const result = await resolveTxInput('from-arg', filePath);
      expect(result).toBe('from-file');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
