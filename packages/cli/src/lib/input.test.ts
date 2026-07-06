import { describe, it, expect } from 'vitest';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseBatchAnalyzeFile, resolveAnalyzeInput, resolveTxInput } from './input.js';

describe('parseBatchAnalyzeFile', () => {
  it('parses arrays of XDR strings as batch input', () => {
    const result = parseBatchAnalyzeFile(JSON.stringify(['AAAA', 'BBBB']), 'testnet');
    expect(result).toEqual([
      { id: 'tx-1', tx: 'AAAA', network: 'testnet' },
      { id: 'tx-2', tx: 'BBBB', network: 'testnet' },
    ]);
  });

  it('parses arrays of objects with per-item network overrides', () => {
    const result = parseBatchAnalyzeFile(
      JSON.stringify([{ id: 'first', tx: 'AAAA', network: 'mainnet' }, { tx: 'BBBB' }]),
      'testnet',
    );
    expect(result).toEqual([
      { id: 'first', tx: 'AAAA', network: 'mainnet' },
      { id: 'tx-2', tx: 'BBBB', network: 'testnet' },
    ]);
  });
});

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

describe('resolveAnalyzeInput', () => {
  it('returns batch items for a batch JSON file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'meridian-cli-'));
    const filePath = join(dir, 'txs.json');
    await writeFile(filePath, JSON.stringify([{ tx: 'AAAA' }, { id: 'second', tx: 'BBBB', network: 'mainnet' }]));

    try {
      const result = await resolveAnalyzeInput(undefined, filePath, 'testnet');
      expect(result).toEqual({
        kind: 'batch',
        items: [
          { id: 'tx-1', tx: 'AAAA', network: 'testnet' },
          { id: 'second', tx: 'BBBB', network: 'mainnet' },
        ],
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
