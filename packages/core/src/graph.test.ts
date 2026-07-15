import { describe, expect, it } from 'vitest';
import {
  buildExecutionGraph,
  buildStateChangeSummary,
  collectTokenMovements,
  parseClassicPayment,
} from './graph.js';
import type { EcosystemManifest, FieldResult, TraceResult } from './types.js';

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
    {
      index: 3,
      type: 'classic',
      description: 'Payment: 1000 → GDEST',
    },
  ],
  auth_entries: [{ address: 'GUSER', contract_id: 'CA', credentials: ['require_auth'] }],
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

const manifesto: EcosystemManifest = {
  name: 'eco',
  version: '1',
  contracts: [{
    name: 'Router',
    address: 'CA',
    network: 'testnet',
    role: 'router',
    criticality: 'HIGH',
    audit_status: 'audited',
    upgradeable: false,
    reputation_score: 90,
  }],
};

describe('parseClassicPayment', () => {
  it('parses amount and destination', () => {
    expect(parseClassicPayment('Payment: 1000 → GDEST')).toEqual({
      amount: '1000',
      asset: undefined,
      to: 'GDEST',
    });
  });
});

describe('buildExecutionGraph', () => {
  it('includes invoke, downstream, auth, and token edges', () => {
    const graph = buildExecutionGraph(trace, field, manifesto);
    expect(graph.root_contracts).toContain('CA');
    expect(graph.downstream_contracts).toContain('CB');
    expect(graph.auth_dependencies).toContain('CA');
    expect(graph.edges.some((e) => e.type === 'invoke')).toBe(true);
    expect(graph.edges.some((e) => e.type === 'auth' && e.from === 'GUSER')).toBe(true);
    expect(graph.token_movements.some((m) => m.source === 'classic' && m.amount === '1000')).toBe(true);
    expect(graph.nodes.find((n) => n.address === 'CA')?.audit_status).toBe('audited');
    expect(graph.state_surfaces.write).toContain('write-b');
  });

  it('prefers decoded token events over heuristics', () => {
    const withDecoded: TraceResult = {
      ...trace,
      token_events: [{
        from: 'GA',
        to: 'GB',
        amount: '42',
        asset: 'CA',
        description: 'Decoded transfer 42',
        source: 'decoded',
      }],
    };
    const movements = collectTokenMovements(withDecoded);
    expect(movements[0].source).toBe('decoded');
    expect(movements[0].amount).toBe('42');
  });
});

describe('buildStateChangeSummary', () => {
  it('summarizes read/write surfaces and value diffs', () => {
    const summary = buildStateChangeSummary(trace, field, [{
      ledger_key: 'write-b',
      before: 'abc',
      after: '(simulated write)',
      description: 'test',
    }]);
    expect(summary.reads).toHaveLength(1);
    expect(summary.writes).toHaveLength(1);
    expect(summary.irreversible_writes).toBe(1);
    expect(summary.value_diffs?.[0].before).toBe('abc');
    expect(summary.summary).toContain('write');
  });
});
