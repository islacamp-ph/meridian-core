import { beforeEach, describe, it, expect, vi } from 'vitest';

const createMessageMock = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = {
      create: createMessageMock,
    };
  },
}));

import { generateFallbackBrief, synthesizeBrief } from './brief.js';
import type { BriefInput } from './brief.js';
import { buildBriefCacheKey, clearBriefCache } from './cache.js';

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
    simulation_context: {
      ledgerSequence: 123,
      latestLedger: 123,
      footprintContracts: ['CCONTRACT123'],
      readOnly: [],
      readWrite: [],
    },
  },
  field: {
    contracts_mapped: 1,
    dependency_graph: [],
    ttl_warnings: [],
    manifest_coverage: 0,
  },
  gravity: {
    blast_radius: 40,
    score_breakdown: {
      formula: 'blast_radius = sum(contract_scores) / total_contracts, capped at 100',
      total_contracts: 1,
      total_weighted_score: 40,
      normalized_score: 40,
      contributions: [],
    },
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
  beforeEach(() => {
    vi.clearAllMocks();
    createMessageMock.mockReset();
    clearBriefCache();
    delete process.env.ANTHROPIC_API_KEY;
  });
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

  it('uses deterministic fallback when no API key is configured', async () => {
    const brief = await synthesizeBrief(baseInput);
    expect(typeof brief).toBe('string');
    expect(brief).toContain('ABORT');
  });

  it('returns a BRIEF error when the API call fails', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    createMessageMock.mockRejectedValue(new Error('upstream failed'));

    const result = await synthesizeBrief(baseInput, { apiKey: 'test-key', skipCache: true });
    expect(typeof result).toBe('object');
    expect(result).toMatchObject({ code: 'BRIEF_API_ERROR', layer: 'BRIEF' });
  });

  it('includes FIELD data in the Claude context payload', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    createMessageMock.mockResolvedValue({
      content: [{ type: 'text', text: 'structured brief' }],
    });

    await synthesizeBrief(baseInput, { apiKey: 'test-key', skipCache: true });

    const call = createMessageMock.mock.calls[0]?.[0];
    const userContent = call.messages[0].content as string;
    expect(userContent).toContain('"field"');
    expect(userContent).toContain('"contracts_mapped": 1');
  });

  it('caches successful BRIEF synthesis results', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    createMessageMock.mockResolvedValue({
      content: [{ type: 'text', text: 'cached brief' }],
    });

    const first = await synthesizeBrief(baseInput, { apiKey: 'test-key' });
    const second = await synthesizeBrief(baseInput, { apiKey: 'test-key' });

    expect(first).toBe('cached brief');
    expect(second).toBe('cached brief');
    expect(createMessageMock).toHaveBeenCalledTimes(1);
    expect(buildBriefCacheKey(baseInput)).toHaveLength(64);
  });
});
