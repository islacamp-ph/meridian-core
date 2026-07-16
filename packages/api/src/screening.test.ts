import { describe, expect, it } from 'vitest';
import {
  buildScreeningPolicyRules,
  mergeScreeningOptions,
  toScreeningResult,
} from './screening.js';
import type { StructuredAnalyzeResponse } from '@meridian/core';

function makeAnalysis(
  overrides: Partial<StructuredAnalyzeResponse> = {},
): StructuredAnalyzeResponse {
  return {
    product: 'MERIDIAN',
    version: '0.0.0',
    verdict: 'CLEAR',
    confidence: 0.9,
    decision: { action: 'submit', reason: 'ok', confidence: 0.9, top_risks: [] },
    execution_graph: {
      nodes: [],
      edges: [],
      root_contracts: ['CA'],
      downstream_contracts: [],
      auth_dependencies: [],
      state_surfaces: { read: [], write: [] },
      token_movements: [],
    },
    state_changes: {
      summary: 'none',
      reads: [],
      writes: [],
      irreversible_writes: 0,
      contracts_read: [],
      contracts_written: [],
    },
    top_risks: [],
    trace: {
      success: true,
      execution_path: [],
      auth_entries: [],
      fee_estimate: { classic_base_fee: 100, min_resource_fee: 0, total_fee: 100 },
      resource_usage: { cpu_instructions: 0, memory_bytes: 0, read_bytes: 0, write_bytes: 0 },
      simulation_context: {
        ledgerSequence: 1,
        latestLedger: 1,
        footprintContracts: ['CA'],
        readOnly: [],
        readWrite: [],
      },
    },
    field: {
      contracts_mapped: 1,
      dependency_graph: [{ address: 'CA', dependencies: [], depth: 0 }],
      ttl_warnings: [],
      manifest_coverage: 1,
      upgrade_warnings: [],
    },
    gravity: {
      blast_radius: 10,
      score_breakdown: {
        formula: 't',
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
    },
    explainability: {
      operations: [],
      contracts: [],
      blast_radius: {
        formula: 't',
        total_contracts: 1,
        total_weighted_score: 10,
        normalized_score: 10,
        contributions: [],
      },
    },
    meta: {
      analyzed_at: new Date().toISOString(),
      ledger_sequence: 1,
      simulation_stale: false,
      network: 'testnet',
      processing_ms: 1,
      layer_timings_ms: { trace: 1, field: 1, gravity: 1 },
      unmapped_contracts: 0,
      confidence_bucket: 'HIGH',
    },
    ...overrides,
  };
}

describe('screening', () => {
  it('builds exchange policy pack with allowlist_only', () => {
    const rules = buildScreeningPolicyRules('exchange');
    expect(rules.some((r) => r.type === 'unknown_contract')).toBe(true);
    expect(rules.some((r) => r.type === 'allowlist_only')).toBe(true);
  });

  it('merges allowlist into profile rules', () => {
    const merged = mergeScreeningOptions(
      'exchange',
      { tx: 'x', network: 'testnet' },
      ['CA'],
    );
    const allow = merged.options?.policy_rules?.find((r) => r.type === 'allowlist_only');
    expect(allow?.allowlist).toEqual(['CA']);
  });

  it('maps hold to review disposition', () => {
    const result = toScreeningResult(
      makeAnalysis({
        verdict: 'WARN',
        decision: { action: 'hold', reason: 'review', confidence: 0.7, top_risks: [] },
      }),
      'treasury',
      buildScreeningPolicyRules('treasury'),
    );
    expect(result.disposition).toBe('review');
  });

  it('maps rewrite to block disposition', () => {
    const result = toScreeningResult(
      makeAnalysis({
        verdict: 'ABORT',
        decision: { action: 'rewrite', reason: 'unsafe', confidence: 0.4, top_risks: [] },
      }),
      'custodian',
      buildScreeningPolicyRules('custodian'),
    );
    expect(result.disposition).toBe('block');
  });
});
