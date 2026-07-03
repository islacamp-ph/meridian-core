import { describe, it, expect } from 'vitest';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadManifest } from './manifest.js';

describe('loadManifest', () => {
  it('returns undefined when no path is given', async () => {
    const result = await loadManifest(undefined);
    expect(result).toBeUndefined();
  });

  it('parses a valid ecosystem manifest file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'meridian-cli-'));
    const filePath = join(dir, 'manifest.json');
    const manifest = {
      name: 'test-ecosystem',
      version: '1.0.0',
      contracts: [{ name: 'foo', address: 'CFOO', network: 'testnet' }],
    };
    await writeFile(filePath, JSON.stringify(manifest));

    try {
      const result = await loadManifest(filePath);
      expect(result).toEqual(manifest);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('throws for a missing file', async () => {
    await expect(loadManifest('/nonexistent/manifest.json')).rejects.toThrow(
      /Failed to read ecosystem manifest/,
    );
  });

  it('throws for invalid JSON', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'meridian-cli-'));
    const filePath = join(dir, 'manifest.json');
    await writeFile(filePath, '{ not valid json');

    try {
      await expect(loadManifest(filePath)).rejects.toThrow(/not valid JSON/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('throws when contracts field is missing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'meridian-cli-'));
    const filePath = join(dir, 'manifest.json');
    await writeFile(filePath, JSON.stringify({ name: 'x', version: '1.0.0' }));

    try {
      await expect(loadManifest(filePath)).rejects.toThrow(/must be an object with a "contracts"/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
