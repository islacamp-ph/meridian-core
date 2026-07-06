import { describe, expect, it } from 'vitest';
import { buildFieldGraph } from './index.js';
import type { EcosystemManifest, SimulationContext, TraceResult } from '../types.js';

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
  it('computes manifest coverage over observed contracts', () => {
    const trace = makeTraceResult();
    const context: SimulationContext = {
      ...trace.simulation_context,
      footprintContracts: ['CA', 'CEXTERNAL'],
    };

    const result = buildFieldGraph(trace, context, { network: 'testnet', manifest });
    expect(result.manifest_coverage).toBe(0.5);
  });

  it('includes transitive manifest dependencies with depth', () => {
    const trace = makeTraceResult();
    const result = buildFieldGraph(trace, trace.simulation_context, { network: 'testnet', manifest });

    expect(result.dependency_graph).toEqual([
      { address: 'CA', name: 'A', dependencies: ['CB'], depth: 0 },
      { address: 'CB', name: 'B', dependencies: ['CC'], depth: 1 },
      { address: 'CC', name: 'C', dependencies: [], depth: 2 },
    ]);
  });
});
