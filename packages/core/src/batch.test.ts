import { describe, expect, it, vi } from 'vitest';
import { analyzeBatch, computeRiskScore, summarizeBatch } from './batch.js';
import type { BatchAnalyzeItemResult, StructuredAnalyzeResponse } from './types.js';

vi.mock('./analyze.js', async () => {
  const actual = await vi.importActual<typeof import('./analyze.js')>('./analyze.js');
  return {
    ...actual,
    analyze: vi.fn(),
  };
});

import { analyze } from './analyze.js';

const mockedAnalyze = vi.mocked(analyze);

function makeStructuredResult(
  overrides: Partial<StructuredAnalyzeResponse> = {},
): StructuredAnalyzeResponse {
  return {
    product: 'MERIDIAN',
    version: '0.1.1',
    verdict: 'WARN',
    confidence: 0.7,
    trace: {
      success: false,
      failure_point: {
        step_index: 0,
        contract_id: 'CFAIL',
        function_name: 'transfer',
        error_code: 'AUTH_REQUIRED',
        error_message: 'require_auth failed',
        root_cause: 'Missing or invalid authorization credentials',
      },
      execution_path: [],
      auth_entries: [],
      fee_estimate: { classic_base_fee: 100, min_resource_fee: 0, total_fee: 100 },
      resource_usage: { cpu_instructions: 0, memory_bytes: 0, read_bytes: 0, write_bytes: 0 },
      simulation_context: {
        ledgerSequence: 1,
        latestLedger: 1,
        footprintContracts: [],
        readOnly: [],
        readWrite: [],
      },
      staleness_warning: false,
    },
    field: {
      contracts_mapped: 1,
      dependency_graph: [],
      ttl_warnings: [],
      manifest_coverage: 0,
      upgrade_warnings: [],
    },
    gravity: {
      blast_radius: 20,
      score_breakdown: {
        formula: 'blast_radius = sum(contract_scores) / total_contracts, capped at 100',
        total_contracts: 1,
        total_weighted_score: 20,
        normalized_score: 20,
        contributions: [],
      },
      affected_contracts: [],
      critical: [],
      warning: ['CFAIL'],
      safe: [],
      monitor: [],
      total_affected_users: 0,
      recovery: 'FULL',
    },
    explainability: {
      operations: [],
      contracts: [],
      blast_radius: {
        formula: 'blast_radius = sum(contract_scores) / total_contracts, capped at 100',
        total_contracts: 1,
        total_weighted_score: 20,
        normalized_score: 20,
        contributions: [],
      },
    },
    warnings: [],
    meta: {
      analyzed_at: new Date().toISOString(),
      ledger_sequence: 1,
      simulation_stale: false,
      network: 'testnet',
      processing_ms: 1,
      layer_timings_ms: { trace: 1, field: 0, gravity: 0 },
      unmapped_contracts: 0,
      confidence_bucket: 'MEDIUM',
    },
    ...overrides,
  };
}

describe('computeRiskScore', () => {
  it('scores aborts above clears', () => {
    const clearScore = computeRiskScore(makeStructuredResult({ verdict: 'CLEAR', confidence: 0.95, gravity: { ...makeStructuredResult().gravity, blast_radius: 0, warning: [] } }));
    const abortScore = computeRiskScore(makeStructuredResult({ verdict: 'ABORT', confidence: 0.2, gravity: { ...makeStructuredResult().gravity, blast_radius: 60 } }));
    expect(abortScore).toBeGreaterThan(clearScore);
  });
});

describe('summarizeBatch', () => {
  it('aggregates counts and failure patterns', () => {
    const items: BatchAnalyzeItemResult[] = [
      {
        id: 'tx-1',
        network: 'testnet',
        status: 'ok',
        risk_score: 55,
        result: makeStructuredResult(),
      },
      {
        id: 'tx-2',
        network: 'testnet',
        status: 'error',
        risk_score: 100,
        error: {
          error: 'RPC unavailable',
          code: 'RPC_UNAVAILABLE',
          hint: 'retry later',
          layer: 'TRACE',
        },
      },
    ];

    const summary = summarizeBatch(items);
    expect(summary.total).toBe(2);
    expect(summary.ok).toBe(1);
    expect(summary.errors).toBe(1);
    expect(summary.highest_risk_transaction?.id).toBe('tx-2');
    expect(summary.common_failure_patterns.map((pattern) => pattern.error_code)).toEqual([
      'AUTH_REQUIRED',
      'RPC_UNAVAILABLE',
    ]);
  });
});

describe('analyzeBatch', () => {
  it('builds batch results with ids and summary', async () => {
    mockedAnalyze.mockReset();
    mockedAnalyze
      .mockResolvedValueOnce(makeStructuredResult())
      .mockResolvedValueOnce({
        error: 'RPC unavailable',
        code: 'RPC_UNAVAILABLE',
        hint: 'retry later',
        layer: 'TRACE',
      });

    const batch = await analyzeBatch([
      { tx: 'AAAA', network: 'testnet' },
      { id: 'custom-id', tx: 'BBBB', network: 'mainnet' },
    ]);

    expect(batch.items).toHaveLength(2);
    expect(batch.items[0].id).toBe('tx-1');
    expect(batch.items[1].id).toBe('custom-id');
    expect(batch.summary.highest_risk_transaction?.id).toBe('custom-id');
  });
});
