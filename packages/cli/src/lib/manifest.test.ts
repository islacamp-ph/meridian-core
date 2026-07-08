import { describe, it, expect } from 'vitest';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadManifest,
  readManifestJson,
  resolveManifestPath,
  scaffoldManifest,
  validateEcosystemManifest,
  validateManifestFile,
} from './manifest.js';

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

  it('throws when required fields are missing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'meridian-cli-'));
    const filePath = join(dir, 'manifest.json');
    await writeFile(filePath, JSON.stringify({ name: 'x', version: '1.0.0' }));

    try {
      await expect(loadManifest(filePath)).rejects.toThrow(/failed validation/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('validateEcosystemManifest', () => {
  const validManifest = {
    name: 'test-ecosystem',
    version: '1.0.0',
    contracts: [
      {
        name: 'token',
        address: 'CTOKEN',
        network: 'testnet',
        dependencies: ['CVAULT'],
        active_users: 10,
        criticality: 'HIGH',
      },
      {
        name: 'vault',
        address: 'CVAULT',
        network: 'testnet',
      },
    ],
  };

  it('accepts a valid manifest', () => {
    const result = validateEcosystemManifest(validManifest);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.manifest?.contracts).toHaveLength(2);
  });

  it('rejects missing name and version', () => {
    const result = validateEcosystemManifest({ contracts: [] });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('name must be a non-empty string.');
    expect(result.errors).toContain('version must be a non-empty string.');
  });

  it('rejects invalid contract network', () => {
    const result = validateEcosystemManifest({
      name: 'x',
      version: '1.0.0',
      contracts: [{ name: 'foo', address: 'CFOO', network: 'devnet' }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes('mainnet') || error.includes('testnet'))).toBe(
      true,
    );
  });

  it('rejects duplicate contract addresses', () => {
    const result = validateEcosystemManifest({
      name: 'x',
      version: '1.0.0',
      contracts: [
        { name: 'a', address: 'CDUP', network: 'testnet' },
        { name: 'b', address: 'CDUP', network: 'testnet' },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Duplicate contract address "CDUP".');
  });

  it('rejects dangling dependencies', () => {
    const result = validateEcosystemManifest({
      name: 'x',
      version: '1.0.0',
      contracts: [{ name: 'a', address: 'CA', network: 'testnet', dependencies: ['CMISSING'] }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/unknown dependency/);
  });

  it('warns on empty contracts', () => {
    const result = validateEcosystemManifest({ name: 'x', version: '1.0.0', contracts: [] });
    expect(result.valid).toBe(true);
    expect(result.warnings.some((warning) => warning.includes('empty'))).toBe(true);
  });

  it('warns on unknown keys in strict mode', () => {
    const result = validateEcosystemManifest(
      { ...validManifest, extra: true },
      { strict: true },
    );
    expect(result.valid).toBe(true);
    expect(result.warnings).toContain('Unknown top-level key "extra".');
  });
});

describe('scaffoldManifest', () => {
  it('creates a starter manifest file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'meridian-cli-'));
    const filePath = join(dir, 'manifest.json');

    try {
      const createdPath = await scaffoldManifest({
        path: filePath,
        name: 'starter',
        network: 'mainnet',
      });
      expect(createdPath).toBe(filePath);

      const parsed = await readManifestJson(filePath);
      const validation = validateEcosystemManifest(parsed);
      expect(validation.valid).toBe(true);
      expect(validation.manifest?.name).toBe('starter');
      expect(validation.manifest?.contracts[0]?.network).toBe('mainnet');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('refuses to overwrite without force', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'meridian-cli-'));
    const filePath = join(dir, 'manifest.json');
    await writeFile(filePath, '{}');

    try {
      await expect(
        scaffoldManifest({ path: filePath, name: 'starter', network: 'testnet' }),
      ).rejects.toMatchObject({ code: 'EEXIST' });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('validateManifestFile', () => {
  it('validates a manifest on disk', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'meridian-cli-'));
    const filePath = join(dir, 'manifest.json');
    await writeFile(
      filePath,
      JSON.stringify({
        name: 'disk',
        version: '1.0.0',
        contracts: [{ name: 'foo', address: 'CFOO', network: 'testnet' }],
      }),
    );

    try {
      const result = await validateManifestFile(filePath);
      expect(result.valid).toBe(true);
      expect(result.path).toBe(filePath);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('resolveManifestPath', () => {
  it('defaults to manifest.json', () => {
    expect(resolveManifestPath()).toBe('manifest.json');
    expect(resolveManifestPath('custom.json')).toBe('custom.json');
  });
});
