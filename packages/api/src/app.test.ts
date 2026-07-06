import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@meridian/core', () => ({
  analyze: vi.fn(),
  analyzeBatch: vi.fn(),
  trace: vi.fn(),
  buildFieldGraph: vi.fn(),
  scoreGravity: vi.fn(),
  MERIDIAN_VERSION: 'test-version',
}));

vi.mock('@meridian/ai', () => ({
  synthesizeBrief: vi.fn(),
}));

import { app } from './app.js';
import { analyze, analyzeBatch } from '@meridian/core';
import { synthesizeBrief } from '@meridian/ai';

const mockedAnalyze = vi.mocked(analyze);
const mockedAnalyzeBatch = vi.mocked(analyzeBatch);
const mockedSynthesizeBrief = vi.mocked(synthesizeBrief);

function makeAnalysisResult() {
  return {
    product: 'MERIDIAN' as const,
    version: '0.1.1',
    verdict: 'WARN' as const,
    confidence: 0.72,
    trace: {
      success: true,
      execution_path: [{ index: 0, type: 'invoke' as const, contract_id: 'CPAY', function_name: 'transfer', description: 'Invoke transfer on CPAY' }],
      auth_entries: [],
      fee_estimate: { classic_base_fee: 100, min_resource_fee: 0, total_fee: 100 },
      resource_usage: { cpu_instructions: 0, memory_bytes: 0, read_bytes: 0, write_bytes: 0 },
      simulation_context: { ledgerSequence: 5, latestLedger: 6, footprintContracts: ['CPAY'], readOnly: [], readWrite: [] },
      staleness_warning: false,
    },
    field: {
      contracts_mapped: 1,
      dependency_graph: [{ address: 'CPAY', name: 'Payments', dependencies: [], depth: 0 }],
      ttl_warnings: [],
      manifest_coverage: 1,
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
    },
  };
}

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
