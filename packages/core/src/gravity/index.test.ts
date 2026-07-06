import { describe, expect, it } from 'vitest';
import { scoreGravity } from './index.js';
import type { EcosystemManifest, FieldResult, TraceResult } from '../types.js';

const manifest: EcosystemManifest = {
  name: 'ecosystem',
  version: '1.0.0',
  contracts: [
    {
      name: 'Payments',
      address: 'CPAY',
      network: 'testnet',
      dependencies: ['CPOOL'],
      active_users: 25000,
      criticality: 'HIGH',
      role: 'core',
    },
    {
      name: 'Pool',
      address: 'CPOOL',
      network: 'testnet',
      dependencies: ['CORACLE'],
      active_users: 1500,
      criticality: 'MEDIUM',
      role: 'pool',
    },
    {
      name: 'Oracle',
      address: 'CORACLE',
      network: 'testnet',
      dependencies: [],
      active_users: 100,
      criticality: 'LOW',
      role: 'oracle',
    },
  ],
};

function makeField(): FieldResult {
  return {
    contracts_mapped: 3,
    dependency_graph: [
      { address: 'CPAY', name: 'Payments', dependencies: ['CPOOL'], depth: 0 },
      { address: 'CPOOL', name: 'Pool', dependencies: ['CORACLE'], depth: 1 },
      { address: 'CORACLE', name: 'Oracle', dependencies: [], depth: 2 },
    ],
    ttl_warnings: [],
    manifest_coverage: 1,
  };
}

describe('scoreGravity', () => {
  it('weights direct failure, criticality, users, and dependencies', () => {
    const trace: TraceResult = {
      success: false,
      failure_point: {
        step_index: 0,
        contract_id: 'CPAY',
        function_name: 'transfer',
        error_code: 'AUTH_REQUIRED',
        error_message: 'require_auth failed',
        root_cause: 'Missing or invalid authorization credentials',
      },
      execution_path: [
        {
          index: 0,
          type: 'invoke',
          contract_id: 'CPAY',
          function_name: 'transfer',
          description: 'Invoke transfer on CPAY',
        },
      ],
      auth_entries: [{ address: 'CPAY', contract_id: 'CPAY', credentials: ['auth'] }],
      fee_estimate: { classic_base_fee: 100, min_resource_fee: 0, total_fee: 100 },
      resource_usage: { cpu_instructions: 0, memory_bytes: 0, read_bytes: 0, write_bytes: 0 },
      simulation_context: {
        ledgerSequence: 1,
        latestLedger: 1,
        footprintContracts: ['CPAY', 'CPOOL'],
        readOnly: [],
        readWrite: [],
      },
    };

    const gravity = scoreGravity(trace, makeField(), { manifest });

    expect(gravity.critical).toEqual(['CPAY']);
    expect(gravity.warning).toContain('CPOOL');
    expect(gravity.monitor).toContain('CORACLE');
    expect(gravity.score_breakdown.normalized_score).toBe(gravity.blast_radius);
    expect(gravity.score_breakdown.contributions[0]).toMatchObject({
      address: 'CPAY',
      impact: 'CRITICAL',
    });
    expect(
      gravity.affected_contracts.find((contract) => contract.address === 'CPAY')?.score_breakdown.factors.some(
        (factor) => factor.key === 'direct_failure_point' && factor.applied,
      ),
    ).toBe(true);
  });

  it('keeps read-only transitive dependencies below directly written contracts on success', () => {
    const trace: TraceResult = {
      success: true,
      execution_path: [
        {
          index: 0,
          type: 'invoke',
          contract_id: 'CPAY',
          function_name: 'transfer',
          description: 'Invoke transfer on CPAY',
        },
      ],
      auth_entries: [],
      fee_estimate: { classic_base_fee: 100, min_resource_fee: 0, total_fee: 100 },
      resource_usage: { cpu_instructions: 0, memory_bytes: 0, read_bytes: 0, write_bytes: 0 },
      simulation_context: {
        ledgerSequence: 1,
        latestLedger: 1,
        footprintContracts: ['CPAY', 'CPOOL'],
        readOnly: [],
        readWrite: [],
      },
    };

    const gravity = scoreGravity(trace, makeField(), { manifest });
    const pay = gravity.affected_contracts.find((contract) => contract.address === 'CPAY');
    const oracle = gravity.affected_contracts.find((contract) => contract.address === 'CORACLE');

    expect(pay?.score).toBeGreaterThan(oracle?.score ?? 0);
    expect(pay?.impact).toBe('WARNING');
    expect(oracle?.impact).toBe('MONITOR');
  });
});
