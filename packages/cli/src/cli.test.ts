import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('./internal/meridian-core.js', () => ({
  trace: vi.fn(),
  buildFieldGraph: vi.fn(),
  scoreGravity: vi.fn(),
  analyze: vi.fn(),
  MERIDIAN_VERSION: 'test-engine-version',
}));

vi.mock('./internal/meridian-ai.js', () => ({
  synthesizeBrief: vi.fn(),
}));

import { buildProgram } from './cli.js';
import { trace } from './internal/meridian-core.js';

const mockedTrace = vi.mocked(trace);

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'meridian-cli-test-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe('CLI integration', () => {
  let stdout: string[];
  let stderr: string[];
  let exitCode: number | undefined;

  beforeEach(() => {
    stdout = [];
    stderr = [];
    exitCode = undefined;
    mockedTrace.mockReset();

    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      stdout.push(args.map(String).join(' '));
    });
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      stderr.push(args.map(String).join(' '));
    });
    vi.spyOn(process, 'exit').mockImplementation((code?: string | number | null | undefined) => {
      exitCode = typeof code === 'number' ? code : 0;
      throw new Error(`process.exit:${exitCode}`);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prints version output', async () => {
    await buildProgram().parseAsync(['node', 'meridian', 'version']);
    expect(stdout[0]).toMatch(/meridian-core v/);
    expect(stdout[0]).toMatch(/engine vtest-engine-version/);
  });

  it('prints version as JSON with --json', async () => {
    await buildProgram().parseAsync(['node', 'meridian', 'version', '--json']);
    const body = JSON.parse(stdout[0] ?? '{}');
    expect(body.product).toBe('MERIDIAN');
    expect(body.engine_version).toBe('test-engine-version');
  });

  it('creates a manifest with init', async () => {
    await withTempDir(async (dir) => {
      const filePath = join(dir, 'manifest.json');
      await buildProgram().parseAsync([
        'node',
        'meridian',
        'init',
        filePath,
        '--name',
        'demo',
        '--network',
        'testnet',
      ]);

      expect(stdout.some((line) => line.includes('Created ecosystem manifest'))).toBe(true);
      const result = await import('./lib/manifest.js').then((mod) => mod.validateManifestFile(filePath));
      expect(result.valid).toBe(true);
      expect(result.manifest?.name).toBe('demo');
    });
  });

  it('validates a manifest file successfully', async () => {
    await withTempDir(async (dir) => {
      const filePath = join(dir, 'manifest.json');
      await writeFile(
        filePath,
        JSON.stringify({
          name: 'demo',
          version: '1.0.0',
          contracts: [{ name: 'foo', address: 'CFOO', network: 'testnet' }],
        }),
      );

      await buildProgram().parseAsync(['node', 'meridian', 'manifest', 'validate', filePath]);
      expect(stdout.some((line) => line.includes('Valid ecosystem manifest'))).toBe(true);
    });
  });

  it('exits with code 1 when manifest validation fails', async () => {
    await withTempDir(async (dir) => {
      const filePath = join(dir, 'manifest.json');
      await writeFile(filePath, JSON.stringify({ name: 'demo', version: '1.0.0' }));

      await expect(
        buildProgram().parseAsync(['node', 'meridian', 'manifest', 'validate', filePath]),
      ).rejects.toThrow('process.exit:1');
      expect(exitCode).toBe(1);
      expect(stderr.some((line) => line.includes('Invalid ecosystem manifest'))).toBe(true);
    });
  });

  it('runs trace with mocked core and prints JSON', async () => {
    mockedTrace.mockResolvedValue({
      success: true,
      execution_path: [],
      auth_entries: [],
      fee_estimate: { classic_base_fee: 100, min_resource_fee: 0, total_fee: 100 },
      resource_usage: { cpu_instructions: 0, memory_bytes: 0, read_bytes: 0, write_bytes: 0 },
      simulation_context: {
        ledgerSequence: 1,
        latestLedger: 2,
        footprintContracts: [],
        readOnly: [],
        readWrite: [],
      },
      rpc_metrics: {
        simulate_transaction_ms: 1,
        get_latest_ledger_ms: 1,
        latest_ledger_fallback: false,
        latest_ledger_timed_out: false,
        timeout_ms: 30000,
      },
      staleness_warning: false,
    });

    await buildProgram().parseAsync([
      'node',
      'meridian',
      'trace',
      'AAAA',
      '--network',
      'testnet',
      '--json',
    ]);

    const body = JSON.parse(stdout[0] ?? '{}');
    expect(body.success).toBe(true);
    expect(mockedTrace).toHaveBeenCalledWith('AAAA', { network: 'testnet', rpcUrl: undefined });
  });

  it('exits with code 1 when trace returns a MeridianError in JSON mode', async () => {
    mockedTrace.mockResolvedValue({
      error: 'Simulation failed',
      code: 'TRACE_SIMULATION_FAILED',
      hint: 'retry',
      layer: 'TRACE',
    });

    await expect(
      buildProgram().parseAsync([
        'node',
        'meridian',
        'trace',
        'AAAA',
        '--network',
        'testnet',
        '--json',
      ]),
    ).rejects.toThrow('process.exit:1');

    expect(exitCode).toBe(1);
    const body = JSON.parse(stdout[0] ?? '{}');
    expect(body.code).toBe('TRACE_SIMULATION_FAILED');
  });
});
