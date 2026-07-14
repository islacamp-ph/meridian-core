import { describe, expect, it } from 'vitest';
import { buildExecutionGraph, buildStateChangeSummary } from './graph.js';
import type { FieldResult, TraceResult } from './types.js';

const trace: TraceResult = {
  success: true,
  execution_path: [
    {
      index: 0,
      type: 'invoke',
      contract_id: 'CA',
      function_name: 'swap',
      description: 'Invoke swap on CA',
    },
    {
      index: 1,
      type: 'invoke',
      contract_id: 'CB',
      function_name: 'transfer',
      description: 'Invoke transfer on CB (from CA)',
    },
    {
      index: 2,
      type: 'auth',
      contract_id: 'CA',
      description: 'Authorization required for CA',
    },
  ],
  auth_entries: [{ address: 'CA', contract_id: 'CA', credentials: ['require_auth'] }],
  fee_estimate: { classic_base_fee: 100, min_resource_fee: 0, total_fee: 100 },
  resource_usage: { cpu_instructions: 0, memory_bytes: 0, read_bytes: 0, write_bytes: 0 },
  simulation_context: {
    ledgerSequence: 1,
    latestLedger: 1,
    footprintContracts: ['CA', 'CB'],
    readOnly: ['read-a'],
    readWrite: ['write-b'],
  },
};

const field: FieldResult = {
  contracts_mapped: 2,
  dependency_graph: [
    { address: 'CA', dependencies: ['CB'], depth: 0, source: 'execution_path' },
    { address: 'CB', dependencies: [], depth: 1, source: 'manifest' },
  ],
  ttl_warnings: [],
  manifest_coverage: 1,
  upgrade_warnings: [],
};

describe('buildExecutionGraph', () => {
  it('includes invoke, downstream, auth, and token edges', () => {
    const graph = buildExecutionGraph(trace, field);
    expect(graph.root_contracts).toContain('CA');
    expect(graph.downstream_contracts).toContain('CB');
    expect(graph.auth_dependencies).toContain('CA');
    expect(graph.edges.some((e) => e.type === 'invoke')).toBe(true);
    expect(graph.edges.some((e) => e.type === 'auth')).toBe(true);
    expect(graph.token_movements.length).toBeGreaterThan(0);
    expect(graph.state_surfaces.write).toContain('write-b');
  });
});

describe('buildStateChangeSummary', () => {
  it('summarizes read/write surfaces', () => {
    const summary = buildStateChangeSummary(trace, field);
    expect(summary.reads).toHaveLength(1);
    expect(summary.writes).toHaveLength(1);
    expect(summary.irreversible_writes).toBe(1);
    expect(summary.summary).toContain('write');
  });
});
