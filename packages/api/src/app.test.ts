import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@meridian/core', () => ({
  analyze: vi.fn(),
  analyzeBatch: vi.fn(),
  analyzeDiff: vi.fn(),
  trace: vi.fn(),
  buildFieldGraph: vi.fn(),
  scoreGravity: vi.fn(),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  MERIDIAN_VERSION: 'test-version',
}));

vi.mock('@meridian/ai', () => ({
  synthesizeBrief: vi.fn(),
}));

import { app } from './app.js';
import { analyze, analyzeBatch, analyzeDiff, buildFieldGraph, scoreGravity, trace } from '@meridian/core';
import { synthesizeBrief } from '@meridian/ai';
import { clearMemoryCache } from './cache/index.js';
import { resetRateLimitState } from './middleware/rateLimit.js';

const mockedAnalyze = vi.mocked(analyze);
const mockedAnalyzeBatch = vi.mocked(analyzeBatch);
const mockedAnalyzeDiff = vi.mocked(analyzeDiff);
const mockedTrace = vi.mocked(trace);
const mockedBuildFieldGraph = vi.mocked(buildFieldGraph);
const mockedScoreGravity = vi.mocked(scoreGravity);
const mockedSynthesizeBrief = vi.mocked(synthesizeBrief);

function makeAnalysisResult() {
  return {
    product: 'MERIDIAN' as const,
    version: '0.1.1',
    verdict: 'WARN' as const,
    confidence: 0.72,
    decision: {
      action: 'hold' as const,
      reason: 'Hold submission',
      confidence: 0.72,
      top_risks: [],
    },
    execution_graph: {
      nodes: [],
      edges: [],
      root_contracts: ['CPAY'],
      downstream_contracts: [],
      auth_dependencies: [],
      state_surfaces: { read: [], write: [] },
      token_movements: [],
    },
    state_changes: {
      summary: 'No state changes',
      reads: [],
      writes: [],
      irreversible_writes: 0,
      contracts_read: [],
      contracts_written: [],
    },
    top_risks: [],
    trace: {
      success: true,
      execution_path: [{ index: 0, type: 'invoke' as const, contract_id: 'CPAY', function_name: 'transfer', description: 'Invoke transfer on CPAY' }],
      auth_entries: [],
      fee_estimate: { classic_base_fee: 100, min_resource_fee: 0, total_fee: 100 },
      resource_usage: { cpu_instructions: 0, memory_bytes: 0, read_bytes: 0, write_bytes: 0 },
      simulation_context: { ledgerSequence: 5, latestLedger: 6, footprintContracts: ['CPAY'], readOnly: [], readWrite: [] },
      rpc_metrics: {
        simulate_transaction_ms: 8,
        get_latest_ledger_ms: 2,
        latest_ledger_fallback: false,
        latest_ledger_timed_out: false,
        timeout_ms: 30000,
      },
      staleness_warning: false,
    },
    field: {
      contracts_mapped: 1,
      dependency_graph: [{ address: 'CPAY', name: 'Payments', dependencies: [], depth: 0 }],
      ttl_warnings: [],
      manifest_coverage: 1,
      upgrade_warnings: [],
    },
    gravity: {
      blast_radius: 35,
      score_breakdown: {
        formula: 'blast_radius = sum(contract_scores) / total_contracts, capped at 100',
        total_contracts: 1,
        total_weighted_score: 35,
        normalized_score: 35,
        contributions: [],
      },
      affected_contracts: [],
      critical: [],
      warning: ['CPAY'],
      safe: [],
      monitor: [],
      total_affected_users: 1200,
      recovery: 'FULL' as const,
    },
    explainability: {
      operations: [],
      contracts: [],
      blast_radius: {
        formula: 'blast_radius = sum(contract_scores) / total_contracts, capped at 100',
        total_contracts: 1,
        total_weighted_score: 35,
        normalized_score: 35,
        contributions: [],
      },
    },
    warnings: ['stale warning'],
    meta: {
      analyzed_at: '2026-01-01T00:00:00.000Z',
      ledger_sequence: 5,
      simulation_stale: false,
      network: 'testnet' as const,
      processing_ms: 10,
      layer_timings_ms: { trace: 3, field: 2, gravity: 1 },
      unmapped_contracts: 0,
      confidence_bucket: 'MEDIUM' as const,
    },
  };
}

function makeTraceResult() {
  return {
    success: true,
    execution_path: [{ index: 0, type: 'invoke' as const, contract_id: 'CPAY', function_name: 'transfer', description: 'Invoke transfer on CPAY' }],
    auth_entries: [],
    fee_estimate: { classic_base_fee: 100, min_resource_fee: 0, total_fee: 100 },
    resource_usage: { cpu_instructions: 0, memory_bytes: 0, read_bytes: 0, write_bytes: 0 },
    simulation_context: { ledgerSequence: 5, latestLedger: 6, footprintContracts: ['CPAY'], readOnly: [], readWrite: [] },
    rpc_metrics: {
      simulate_transaction_ms: 8,
      get_latest_ledger_ms: 2,
      latest_ledger_fallback: false,
      latest_ledger_timed_out: false,
      timeout_ms: 30000,
    },
    staleness_warning: false,
  };
}

function makeFieldResult() {
  return {
    contracts_mapped: 1,
    dependency_graph: [{ address: 'CPAY', name: 'Payments', dependencies: [], depth: 0 }],
    ttl_warnings: [],
    manifest_coverage: 1,
    upgrade_warnings: [],
  };
}

function makeGravityResult() {
  return {
    blast_radius: 35,
    score_breakdown: {
      formula: 'blast_radius = sum(contract_scores) / total_contracts, capped at 100',
      total_contracts: 1,
      total_weighted_score: 35,
      normalized_score: 35,
      contributions: [],
    },
    affected_contracts: [],
    critical: [],
    warning: ['CPAY'],
    safe: [],
    monitor: [],
    total_affected_users: 1200,
    recovery: 'FULL' as const,
  };
}

beforeEach(() => {
  delete process.env.MERIDIAN_API_KEY;
  clearMemoryCache();
  resetRateLimitState();
});

describe('GET /v1/health', () => {
  it('returns ok status', async () => {
    const res = await app.request('/v1/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.product).toBe('MERIDIAN');
  });
});

describe('GET /v1/version', () => {
  it('returns version info', async () => {
    const res = await app.request('/v1/version');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.product).toBe('MERIDIAN');
    expect(body.version).toBe('test-version');
  });
});

describe('POST /v1/analyze', () => {
  beforeEach(() => {
    mockedAnalyze.mockReset();
    mockedSynthesizeBrief.mockReset();
  });

  it('returns 400 for missing fields', async () => {
    const res = await app.request('/v1/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('INVALID_REQUEST');
  });

  it('returns 400 for invalid JSON', async () => {
    const res = await app.request('/v1/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });
    expect(res.status).toBe(400);
  });

  it('returns a happy-path analysis with explainability and brief', async () => {
    mockedAnalyze.mockResolvedValue(makeAnalysisResult());
    mockedSynthesizeBrief.mockResolvedValue('brief text');

    const res = await app.request('/v1/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tx: 'AAAA', network: 'testnet' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.brief).toBe('brief text');
    expect(body.explainability).toBeDefined();
    expect(body.gravity.score_breakdown.formula).toContain('sum(contract_scores)');
    expect(body.meta.layer_timings_ms.brief).toBeDefined();
  });

  it('falls back to deterministic brief text when BRIEF synthesis errors', async () => {
    mockedAnalyze.mockResolvedValue(makeAnalysisResult());
    mockedSynthesizeBrief
      .mockResolvedValueOnce({
        error: 'BRIEF synthesis failed',
        code: 'BRIEF_API_ERROR',
        hint: 'retry',
        layer: 'BRIEF',
      })
      .mockResolvedValueOnce('fallback brief');

    const res = await app.request('/v1/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tx: 'AAAA', network: 'testnet' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.brief).toBe('fallback brief');
    expect(body.warnings).toContain('BRIEF synthesis failed');
  });

  it('forwards policy_rules and expected_wasm_hash to analyze()', async () => {
    mockedAnalyze.mockResolvedValue(makeAnalysisResult());
    mockedSynthesizeBrief.mockResolvedValue('brief text');
    const wasmHash = 'ab'.repeat(32);

    const res = await app.request('/v1/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tx: 'AAAA',
        network: 'testnet',
        ecosystem: {
          name: 'demo',
          version: '1.0.0',
          contracts: [
            {
              name: 'vault',
              address: 'CVAULT',
              network: 'testnet',
              expected_wasm_hash: wasmHash,
            },
          ],
        },
        options: {
          policy_rules: [
            { type: 'unknown_contract', effect: 'ABORT' },
            { type: 'max_blast_radius', threshold: 40 },
          ],
        },
      }),
    });

    expect(res.status).toBe(200);
    expect(mockedAnalyze).toHaveBeenCalledWith(
      expect.objectContaining({
        ecosystem: expect.objectContaining({
          contracts: [
            expect.objectContaining({
              address: 'CVAULT',
              expected_wasm_hash: wasmHash,
            }),
          ],
        }),
        options: expect.objectContaining({
          policy_rules: [
            { type: 'unknown_contract', effect: 'ABORT' },
            { type: 'max_blast_radius', threshold: 40 },
          ],
        }),
      }),
    );
    expect(mockedSynthesizeBrief).toHaveBeenCalledWith(
      expect.objectContaining({
        decision: expect.objectContaining({ action: 'hold' }),
        top_risks: expect.any(Array),
      }),
    );
  });

  it('returns 400 for invalid policy_rules', async () => {
    const res = await app.request('/v1/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tx: 'AAAA',
        network: 'testnet',
        options: { policy_rules: [{ type: 'not_a_rule' }] },
      }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.details.some((d: string) => d.includes('policy_rules'))).toBe(true);
  });
});

describe('POST /v1/analyze/diff', () => {
  beforeEach(() => {
    mockedAnalyzeDiff.mockReset();
  });

  it('returns 400 when tx_a or tx_b is missing', async () => {
    const res = await app.request('/v1/analyze/diff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tx_a: 'AAAA', network: 'testnet' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns a diff on happy path', async () => {
    const analysis = makeAnalysisResult();
    mockedAnalyzeDiff.mockResolvedValue({
      product: 'MERIDIAN',
      version: '0.1.1',
      a: analysis,
      b: { ...analysis, decision: { ...analysis.decision, action: 'submit' } },
      diff: {
        summary: 'Submit decision changed between A and B.',
        verdict_changed: false,
        decision_changed: true,
        blast_radius_delta: 0,
        contracts_added: [],
        contracts_removed: [],
        auth_added: [],
        auth_removed: [],
        writes_added: [],
        writes_removed: [],
        risks_added: [],
        risks_removed: [],
      },
    });

    const res = await app.request('/v1/analyze/diff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tx_a: 'AAAA', tx_b: 'BBBB', network: 'testnet' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.diff.decision_changed).toBe(true);
    expect(mockedAnalyzeDiff).toHaveBeenCalledWith(
      expect.objectContaining({ tx_a: 'AAAA', tx_b: 'BBBB', network: 'testnet' }),
    );
  });
});

describe('GET /v1/metrics', () => {
  it('returns an observability snapshot', async () => {
    const res = await app.request('/v1/metrics');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.requests_total).toBeDefined();
    expect(body.confidence_distribution).toBeDefined();
  });
});

describe('POST /v1/analyze/batch', () => {
  beforeEach(() => {
    mockedAnalyzeBatch.mockReset();
  });

  it('returns 400 for invalid JSON', async () => {
    const res = await app.request('/v1/analyze/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing items', async () => {
    const res = await app.request('/v1/analyze/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('INVALID_REQUEST');
  });

  it('returns 400 when a batch item has no network and no default network', async () => {
    const res = await app.request('/v1/analyze/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [{ tx: 'AAAA' }] }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid network values', async () => {
    const res = await app.request('/v1/analyze/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ default_network: 'invalid', items: [{ tx: 'AAAA' }] }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.details[0]).toContain('default_network');
  });

  it('returns a batch summary on the happy path', async () => {
    mockedAnalyzeBatch.mockResolvedValue({
      product: 'MERIDIAN',
      version: '0.1.1',
      items: [{ id: 'tx-1', network: 'testnet', status: 'ok', risk_score: 55, result: makeAnalysisResult() }],
      summary: {
        total: 1,
        ok: 1,
        errors: 0,
        clear: 0,
        warn: 1,
        abort: 0,
        stale: 0,
        average_confidence: 0.72,
        highest_risk_transaction: { id: 'tx-1', network: 'testnet', status: 'ok', risk_score: 55, verdict: 'WARN', blast_radius: 35 },
        common_failure_patterns: [],
      },
    });

    const res = await app.request('/v1/analyze/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ default_network: 'testnet', items: [{ tx: 'AAAA' }] }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary.total).toBe(1);
    expect(body.summary.highest_risk_transaction.id).toBe('tx-1');
  });
});

describe('POST /v1/trace', () => {
  beforeEach(() => {
    mockedTrace.mockReset();
  });

  it('returns 400 for missing fields', async () => {
    const res = await app.request('/v1/trace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('returns TRACE result on happy path', async () => {
    mockedTrace.mockResolvedValue(makeTraceResult());

    const res = await app.request('/v1/trace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tx: 'AAAA', network: 'testnet' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(mockedTrace).toHaveBeenCalledTimes(1);
  });

  it('returns 502 when TRACE fails', async () => {
    mockedTrace.mockResolvedValue({
      error: 'Simulation failed',
      code: 'TRACE_SIMULATION_FAILED',
      hint: 'retry',
      layer: 'TRACE',
    });

    const res = await app.request('/v1/trace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tx: 'AAAA', network: 'testnet' }),
    });

    expect(res.status).toBe(502);
  });
});

describe('POST /v1/field', () => {
  beforeEach(() => {
    mockedTrace.mockReset();
    mockedBuildFieldGraph.mockReset();
  });

  it('returns 400 for invalid JSON', async () => {
    const res = await app.request('/v1/field', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });
    expect(res.status).toBe(400);
  });

  it('returns FIELD result on happy path', async () => {
    mockedTrace.mockResolvedValue(makeTraceResult());
    mockedBuildFieldGraph.mockResolvedValue(makeFieldResult());

    const res = await app.request('/v1/field', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tx: 'AAAA', network: 'testnet' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.contracts_mapped).toBe(1);
    expect(mockedBuildFieldGraph).toHaveBeenCalledTimes(1);
  });
});

describe('POST /v1/gravity', () => {
  beforeEach(() => {
    mockedTrace.mockReset();
    mockedBuildFieldGraph.mockReset();
    mockedScoreGravity.mockReset();
  });

  it('returns 400 for missing network', async () => {
    const res = await app.request('/v1/gravity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tx: 'AAAA' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns GRAVITY result on happy path', async () => {
    mockedTrace.mockResolvedValue(makeTraceResult());
    mockedBuildFieldGraph.mockResolvedValue(makeFieldResult());
    mockedScoreGravity.mockReturnValue(makeGravityResult());

    const res = await app.request('/v1/gravity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tx: 'AAAA', network: 'testnet' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.blast_radius).toBe(35);
    expect(mockedScoreGravity).toHaveBeenCalledTimes(1);
  });
});

describe('GET /v1/openapi.json', () => {
  it('returns the OpenAPI document', async () => {
    const res = await app.request('/v1/openapi.json');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.openapi).toBe('3.1.0');
    expect(body.paths['/v1/analyze']).toBeDefined();
    expect(body.paths['/v1/analyze/diff']).toBeDefined();
    expect(body.components.schemas.AnalyzeOptions.properties.policy_rules).toBeDefined();
    expect(body.components.schemas.ManifestContract.properties.expected_wasm_hash).toBeDefined();
  });
});

describe('auth middleware', () => {
  it('returns 401 when MERIDIAN_API_KEY is set and no key is provided', async () => {
    process.env.MERIDIAN_API_KEY = 'secret-key';

    const res = await app.request('/v1/metrics');
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('allows protected routes with a valid bearer token', async () => {
    process.env.MERIDIAN_API_KEY = 'secret-key';

    const res = await app.request('/v1/metrics', {
      headers: { Authorization: 'Bearer secret-key' },
    });
    expect(res.status).toBe(200);
  });

  it('does not require auth for health', async () => {
    process.env.MERIDIAN_API_KEY = 'secret-key';

    const res = await app.request('/v1/health');
    expect(res.status).toBe(200);
  });
});

describe('body size limit', () => {
  it('returns 413 when Content-Length exceeds the limit', async () => {
    process.env.MERIDIAN_MAX_BODY_BYTES = '10';

    const res = await app.request('/v1/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': '100',
      },
      body: JSON.stringify({ tx: 'AAAA', network: 'testnet' }),
    });

    expect(res.status).toBe(413);
    delete process.env.MERIDIAN_MAX_BODY_BYTES;
  });
});

describe('rate limit middleware', () => {
  it('returns 429 after exceeding the per-minute limit', async () => {
    process.env.MERIDIAN_RATE_LIMIT_PER_MINUTE = '2';
    resetRateLimitState();

    const headers = { 'X-Forwarded-For': '203.0.113.10' };

    const first = await app.request('/v1/health', { headers });
    const second = await app.request('/v1/health', { headers });
    const third = await app.request('/v1/health', { headers });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(429);
    expect(third.headers.get('Retry-After')).toBeTruthy();

    delete process.env.MERIDIAN_RATE_LIMIT_PER_MINUTE;
    resetRateLimitState();
  });
});

describe('layer route caching', () => {
  beforeEach(() => {
    mockedTrace.mockReset();
    clearMemoryCache();
  });

  it('reuses TRACE cache across repeated /v1/trace requests', async () => {
    mockedTrace.mockResolvedValue(makeTraceResult());

    const body = JSON.stringify({ tx: 'AAAA', network: 'testnet' });
    const headers = { 'Content-Type': 'application/json' };

    const first = await app.request('/v1/trace', { method: 'POST', headers, body });
    const second = await app.request('/v1/trace', { method: 'POST', headers, body });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(mockedTrace).toHaveBeenCalledTimes(1);
  });
});
