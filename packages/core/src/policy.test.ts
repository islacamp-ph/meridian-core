import { describe, expect, it } from 'vitest';
import { evaluatePolicy } from './policy.js';
import type { EcosystemManifest, FieldResult, GravityResult, TraceResult } from './types.js';

const manifesto: EcosystemManifest = {
  name: 'eco',
  version: '1',
  contracts: [
    { name: 'A', address: 'CA', network: 'testnet', role: 'vault' },
  ],
};

const trace: TraceResult = {
  success: true,
  execution_path: [
    { index: 0, type: 'invoke', contract_id: 'CA', function_name: 'run', description: 'run' },
    { index: 1, type: 'invoke', contract_id: 'CUNKNOWN', function_name: 'x', description: 'x' },
  ],
  auth_entries: [{ address: 'CA', contract_id: 'CA', credentials: ['require_auth', 'admin'] }],
  fee_estimate: { classic_base_fee: 100, min_resource_fee: 0, total_fee: 100 },
  resource_usage: { cpu_instructions: 0, memory_bytes: 0, read_bytes: 0, write_bytes: 0 },
  simulation_context: {
    ledgerSequence: 1,
    latestLedger: 1,
    footprintContracts: ['CA', 'CUNKNOWN'],
    readOnly: [],
    readWrite: [],
  },
};

const field: FieldResult = {
  contracts_mapped: 2,
  dependency_graph: [
    { address: 'CA', dependencies: [], depth: 0 },
    { address: 'CUNKNOWN', dependencies: [], depth: 0 },
  ],
  ttl_warnings: [],
  manifest_coverage: 0.5,
  upgrade_warnings: [],
};

const gravity: GravityResult = {
  blast_radius: 60,
  score_breakdown: {
    formula: 't',
    total_contracts: 2,
    total_weighted_score: 120,
    normalized_score: 60,
    contributions: [],
  },
  affected_contracts: [],
  critical: [],
  warning: ['CA'],
  safe: [],
  monitor: [],
  total_affected_users: 0,
  recovery: 'PARTIAL',
};

describe('evaluatePolicy', () => {
  it('fails unknown contracts', () => {
    const result = evaluatePolicy({
      rules: [{ type: 'unknown_contract' }],
      trace,
      field,
      gravity,
      confidence: 0.9,
      manifest: manifesto,
    });
    expect(result.passed).toBe(false);
    expect(result.effect).toBe('ABORT');
    expect(result.violations.some((v) => v.contract_id === 'CUNKNOWN')).toBe(true);
  });

  it('enforces allowlist_only', () => {
    const result = evaluatePolicy({
      rules: [{ type: 'allowlist_only', allowlist: ['CA'] }],
      trace,
      field,
      gravity,
      confidence: 0.9,
    });
    expect(result.effect).toBe('ABORT');
    expect(result.violations.some((v) => v.contract_id === 'CUNKNOWN')).toBe(true);
  });

  it('warns on admin auth path', () => {
    const result = evaluatePolicy({
      rules: [{ type: 'admin_auth_path' }],
      trace,
      field,
      gravity,
      confidence: 0.9,
      manifest: manifesto,
    });
    expect(result.effect).toBe('WARN');
  });

  it('aborts when blast radius exceeds threshold', () => {
    const result = evaluatePolicy({
      rules: [{ type: 'max_blast_radius', threshold: 50 }],
      trace,
      field,
      gravity,
      confidence: 0.9,
      manifest: manifesto,
    });
    expect(result.effect).toBe('ABORT');
  });
});
