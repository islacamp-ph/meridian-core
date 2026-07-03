import { describe, it, expect } from 'vitest';
import { generateFallbackBrief } from '../brief.js';
import type { BriefInput } from '../brief.js';

const baseInput: BriefInput = {
  verdict: 'ABORT',
  confidence: 0.3,
  trace: {
    success: false,
    failure_point: {
      step_index: 0,
      contract_id: 'CCONTRACT123',
      function_name: 'disburse',
      error_code: 'AUTH_REQUIRED',
      error_message: 'require_auth failed',
      root_cause: 'Missing authorization credentials',
    },
    execution_path: [],
    auth_entries: [],
    fee_estimate: { classic_base_fee: 100, min_resource_fee: 0, total_fee: 100 },
    resource_usage: { cpu_instructions: 0, memory_bytes: 0, read_bytes: 0, write_bytes: 0 },
  },
  field: {
    contracts_mapped: 1,
    dependency_graph: [],
    ttl_warnings: [],
    manifest_coverage: 0,
  },
  gravity: {
    blast_radius: 40,
    affected_contracts: [],
    critical: ['CCONTRACT123'],
    warning: [],
    safe: [],
    monitor: [],
    total_affected_users: 150,
    recovery: 'PARTIAL',
  },
  fix_sequence: [
    {
      order: 1,
      operation: 'fix_auth',
      description: 'Sign require_auth credentials',
      estimated_cost_stroops: 100,
      estimated_time_minutes: 10,
    },
  ],
};

describe('generateFallbackBrief', () => {
  it('includes verdict and confidence', () => {
    const brief = generateFallbackBrief(baseInput);
    expect(brief).toContain('ABORT');
    expect(brief).toContain('0.3');
  });

  it('includes failure point details', () => {
    const brief = generateFallbackBrief(baseInput);
    expect(brief).toContain('AUTH_REQUIRED');
    expect(brief).toContain('Missing authorization');
  });

  it('includes affected users from gravity data', () => {
    const brief = generateFallbackBrief(baseInput);
    expect(brief).toContain('150');
  });

  it('includes fix sequence', () => {
    const brief = generateFallbackBrief(baseInput);
    expect(brief).toContain('fix_auth');
  });

  it('flags low confidence', () => {
    const brief = generateFallbackBrief(baseInput);
    expect(brief).toContain('0.75');
  });

  it('stays within 300 word limit', () => {
    const brief = generateFallbackBrief(baseInput);
    const wordCount = brief.split(/\s+/).length;
    expect(wordCount).toBeLessThanOrEqual(300);
  });
});
