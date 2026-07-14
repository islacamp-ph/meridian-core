import { describe, expect, it } from 'vitest';
import { buildDecision, collectTopRisks } from './decision.js';
import type { FieldResult, GravityResult, TraceResult } from './types.js';

function makeTrace(overrides: Partial<TraceResult> = {}): TraceResult {
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
      readWrite: ['write-key'],
    },
    ...overrides,
  };
}

function makeField(overrides: Partial<FieldResult> = {}): FieldResult {
  return {
    contracts_mapped: 1,
    dependency_graph: [{ address: 'CA', dependencies: [], depth: 0 }],
    ttl_warnings: [],
    manifest_coverage: 1,
    upgrade_warnings: [],
    ...overrides,
  };
}

function makeGravity(overrides: Partial<GravityResult> = {}): GravityResult {
  return {
    blast_radius: 10,
    score_breakdown: {
      formula: 'test',
      total_contracts: 1,
      total_weighted_score: 10,
      normalized_score: 10,
      contributions: [],
    },
    affected_contracts: [],
    critical: [],
    warning: [],
    safe: ['CA'],
    monitor: [],
    total_affected_users: 0,
    recovery: 'FULL',
    ...overrides,
  };
}

describe('buildDecision', () => {
  it('returns submit on CLEAR with low risk', () => {
    const decision = buildDecision({
      verdict: 'CLEAR',
      confidence: 0.9,
      trace: makeTrace(),
      field: makeField(),
      gravity: makeGravity(),
    });
    expect(decision.action).toBe('submit');
    expect(decision.top_risks.length).toBeLessThanOrEqual(3);
  });

  it('returns rewrite on auth simulation failure', () => {
    const decision = buildDecision({
      verdict: 'ABORT',
      confidence: 0.9,
      trace: makeTrace({
        success: false,
        failure_point: {
          step_index: 0,
          contract_id: 'CA',
          error_code: 'AUTH_REQUIRED',
          error_message: 'auth failed',
          root_cause: 'Missing authorization credentials',
        },
      }),
      field: makeField(),
      gravity: makeGravity({ blast_radius: 40 }),
    });
    expect(decision.action).toBe('rewrite');
    expect(decision.reason).toContain('Do not submit');
  });

  it('returns hold when policy warns', () => {
    const decision = buildDecision({
      verdict: 'WARN',
      confidence: 0.8,
      trace: makeTrace({ staleness_warning: true }),
      field: makeField(),
      gravity: makeGravity({ blast_radius: 55 }),
      policyEffect: 'WARN',
    });
    expect(decision.action).toBe('hold');
  });
});

describe('collectTopRisks', () => {
  it('surfaces TTL and upgrade risks', () => {
    const risks = collectTopRisks({
      verdict: 'WARN',
      confidence: 0.8,
      trace: makeTrace(),
      field: makeField({
        ttl_warnings: [{
          contract_id: 'CA',
          ledger_key: 'k',
          ttl_remaining: 10,
          severity: 'WARNING',
        }],
        upgrade_warnings: [{
          contract_id: 'CA',
          expected_wasm_hash: 'aa'.repeat(32),
          on_chain_wasm_hash: 'bb'.repeat(32),
        }],
      }),
      gravity: makeGravity(),
    });

    expect(risks.some((r) => r.factor_key === 'ttl_archival')).toBe(true);
    expect(risks.some((r) => r.factor_key === 'upgradeable_dependency')).toBe(true);
  });
});
