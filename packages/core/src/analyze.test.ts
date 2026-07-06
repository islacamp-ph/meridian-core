import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalyzeResponse, TraceResult } from './types.js';

vi.mock('./trace/index.js', () => ({
  trace: vi.fn(),
}));

import { analyze } from './analyze.js';
import { trace } from './trace/index.js';

const mockedTrace = vi.mocked(trace);

function makeTraceResult(): TraceResult {
  return {
    success: true,
    execution_path: [
      {
        index: 0,
        type: 'invoke',
        contract_id: 'CEXECUTION',
        function_name: 'transfer',
        description: 'Invoke transfer on CEXECUTION',
      },
    ],
    auth_entries: [],
    fee_estimate: { classic_base_fee: 100, min_resource_fee: 25, total_fee: 125 },
    resource_usage: { cpu_instructions: 1, memory_bytes: 0, read_bytes: 2, write_bytes: 3 },
    simulation_context: {
      ledgerSequence: 321,
      latestLedger: 327,
      footprintContracts: ['CFOOTPRINT'],
      readOnly: ['read-key'],
      readWrite: ['write-key'],
    },
    staleness_warning: true,
  };
}

describe('analyze', () => {
  beforeEach(() => {
    mockedTrace.mockReset();
  });

  it('threads simulation ledger metadata into analyze response', async () => {
    mockedTrace.mockResolvedValue(makeTraceResult());

    const result = await analyze({ tx: 'AAAA', network: 'testnet' });

    if ('layer' in result) {
      throw new Error(`unexpected MeridianError: ${result.code}`);
    }

    const response = result as Omit<AnalyzeResponse, 'brief'>;
    expect(response.meta.ledger_sequence).toBe(321);
    expect(response.meta.simulation_stale).toBe(true);
    expect(response.meta.layer_timings_ms.trace).toBeGreaterThanOrEqual(0);
    expect(response.meta.unmapped_contracts).toBe(2);
    expect(response.meta.confidence_bucket).toBe('MEDIUM');
    expect(response.field.dependency_graph.map((node) => node.address).sort()).toEqual(
      ['CEXECUTION', 'CFOOTPRINT'],
    );
    expect(response.explainability.operations).toHaveLength(1);
    expect(response.explainability.operations[0].touched_contracts[0]).toMatchObject({
      address: 'CEXECUTION',
      sources: ['execution_path'],
    });
    expect(response.explainability.contracts.map((contract) => contract.address).sort()).toEqual(
      ['CEXECUTION', 'CFOOTPRINT'],
    );
    expect(response.explainability.blast_radius.normalized_score).toBe(response.gravity.blast_radius);
  });
});
