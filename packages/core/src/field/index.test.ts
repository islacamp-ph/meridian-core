import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildFieldGraph } from './index.js';
import type { EcosystemManifest, SimulationContext, TraceResult } from '../types.js';

vi.mock('../trace/rpc.js', () => ({
  resolveRpcUrl: vi.fn(() => 'https://test.rpc'),
  simulateTransaction: vi.fn(),
  fetchLedgerEntryTTLs: vi.fn(async () => []),
  fetchContractWasmHash: vi.fn(async () => undefined),
}));

import { simulateTransaction } from '../trace/rpc.js';

const mockedSimulateTransaction = vi.mocked(simulateTransaction);

function makeTraceResult(): TraceResult {
  return {
    success: true,
    execution_path: [
      {
        index: 0,
        type: 'invoke',
        contract_id: 'CA',
        function_name: 'run',
        description: 'Invoke run on CA',
      },
    ],
    auth_entries: [],
    fee_estimate: { classic_base_fee: 100, min_resource_fee: 0, total_fee: 100 },
    resource_usage: { cpu_instructions: 0, memory_bytes: 0, read_bytes: 0, write_bytes: 0 },
    simulation_context: {
      ledgerSequence: 1,
      latestLedger: 1,
      footprintContracts: ['CA'],
      readOnly: [],
      readWrite: [],
    },
  };
}

const manifest: EcosystemManifest = {
  name: 'ecosystem',
  version: '1.0.0',
  contracts: [
    { name: 'A', address: 'CA', network: 'testnet', dependencies: ['CB'] },
    { name: 'B', address: 'CB', network: 'testnet', dependencies: ['CC'] },
    { name: 'C', address: 'CC', network: 'testnet', dependencies: [] },
  ],
};

describe('buildFieldGraph', () => {
  beforeEach(() => {
    mockedSimulateTransaction.mockReset();
    mockedSimulateTransaction.mockResolvedValue({
      success: true,
      latestLedger: 1,
      simulationLedger: 1,
      minResourceFee: '0',
      events: [],
      rpcMetrics: {
        simulate_transaction_ms: 1,
        get_latest_ledger_ms: 1,
        latest_ledger_fallback: false,
        latest_ledger_timed_out: false,
        timeout_ms: 30000,
      },
    });
  });

  it('computes manifest coverage over observed contracts', async () => {
    const trace = makeTraceResult();
    const context: SimulationContext = {
      ...trace.simulation_context,
      footprintContracts: ['CA', 'CEXTERNAL'],
    };

    const result = await buildFieldGraph(trace, context, {
      network: 'testnet',
      manifest,
      txXdr: 'AAAA',
    });
    expect(result.manifest_coverage).toBe(0.5);
  });

  it('includes transitive manifest dependencies with depth', async () => {
    const trace = makeTraceResult();
    const result = await buildFieldGraph(trace, trace.simulation_context, {
      network: 'testnet',
      manifest,
      txXdr: 'AAAA',
    });

    expect(result.dependency_graph).toEqual([
      { address: 'CA', name: 'A', dependencies: ['CB'], depth: 0, source: 'execution_path', wasm_hash: undefined },
      { address: 'CB', name: 'B', dependencies: ['CC'], depth: 1, source: undefined, wasm_hash: undefined },
      { address: 'CC', name: 'C', dependencies: [], depth: 2, source: undefined, wasm_hash: undefined },
    ]);
  });

  it('re-simulates with record auth mode when txXdr is provided', async () => {
    const trace = makeTraceResult();
    await buildFieldGraph(trace, trace.simulation_context, {
      network: 'testnet',
      manifest,
      txXdr: 'AAAA',
    });

    expect(mockedSimulateTransaction).toHaveBeenCalledWith('AAAA', 'https://test.rpc', {
      network: 'testnet',
      authMode: 'record',
      timeoutMs: 30000,
    });
  });
});
