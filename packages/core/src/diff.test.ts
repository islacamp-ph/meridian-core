import { describe, expect, it } from 'vitest';
import { compareAnalyzeResults } from './diff.js';
import type { StructuredAnalyzeResponse } from './types.js';

function makeResult(overrides: Partial<StructuredAnalyzeResponse> = {}): StructuredAnalyzeResponse {
  return {
    product: 'MERIDIAN',
    version: '0.0.0',
    verdict: 'CLEAR',
    confidence: 0.9,
    decision: {
      action: 'submit',
      reason: 'ok',
      confidence: 0.9,
      top_risks: [],
    },
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

describe('compareAnalyzeResults', () => {
  it('detects contract and decision deltas', () => {
    const a = makeResult();
    const b = makeResult({
      verdict: 'WARN',
      decision: {
        action: 'hold',
        reason: 'hold',
        confidence: 0.8,
        top_risks: [{
          id: 'blast',
          severity: 'HIGH',
          title: 'High blast',
          why_it_matters: 'too wide',
        }],
      },
      top_risks: [{
        id: 'blast',
        severity: 'HIGH',
        title: 'High blast',
        why_it_matters: 'too wide',
      }],
      execution_graph: {
        nodes: [],
        edges: [],
        root_contracts: ['CA'],
        downstream_contracts: ['CB'],
        auth_dependencies: ['CA'],
        state_surfaces: { read: [], write: ['w'] },
        token_movements: [],
      },
      state_changes: {
        summary: 'writes CB',
        reads: [],
        writes: [{ ledger_key: 'w', access: 'write', description: 'w', contract_id: 'CB' }],
        irreversible_writes: 1,
        contracts_read: [],
        contracts_written: ['CB'],
      },
      field: {
        contracts_mapped: 2,
        dependency_graph: [
          { address: 'CA', dependencies: ['CB'], depth: 0 },
          { address: 'CB', dependencies: [], depth: 1 },
        ],
        ttl_warnings: [],
        manifest_coverage: 1,
        upgrade_warnings: [],
      },
      gravity: {
        blast_radius: 55,
        score_breakdown: {
          formula: 't',
          total_contracts: 2,
          total_weighted_score: 110,
          normalized_score: 55,
          contributions: [],
        },
        affected_contracts: [],
        critical: [],
        warning: ['CB'],
        safe: [],
        monitor: [],
        total_affected_users: 0,
        recovery: 'PARTIAL',
      },
    });

    const diff = compareAnalyzeResults(a, b);
    expect(diff.verdict_changed).toBe(true);
    expect(diff.decision_changed).toBe(true);
    expect(diff.contracts_added).toContain('CB');
    expect(diff.blast_radius_delta).toBe(45);
    expect(diff.risks_added[0].id).toBe('blast');
  });
});
