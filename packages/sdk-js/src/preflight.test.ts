import { describe, expect, it } from 'vitest';
import { toPreSignPreview } from './preflight.js';
import type { StructuredAnalyzeResponse } from '@meridian/core';

const analysis = {
  product: 'MERIDIAN',
  version: '0.0.0',
  verdict: 'WARN',
  confidence: 0.7,
  decision: {
    action: 'hold',
    reason: 'Blast radius requires approval',
    confidence: 0.7,
    top_risks: [],
  },
  execution_graph: {
    nodes: [],
    edges: [],
    root_contracts: ['CA'],
    downstream_contracts: ['CB'],
    auth_dependencies: [],
    state_surfaces: { read: [], write: [] },
    token_movements: [{ description: 'Payment: 10 → GDEST', amount: '10', source: 'classic' }],
  },
  state_changes: {
    summary: 'none',
    reads: [],
    writes: [],
    irreversible_writes: 0,
    contracts_read: [],
    contracts_written: [],
  },
  top_risks: [{
    id: 'blast',
    severity: 'HIGH',
    title: 'Wide blast',
    why_it_matters: 'too many contracts',
  }],
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
    contracts_mapped: 2,
    dependency_graph: [],
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
    warning: [],
    safe: [],
    monitor: [],
    total_affected_users: 0,
    recovery: 'PARTIAL',
  },
  explainability: {
    operations: [],
    contracts: [],
    blast_radius: {
      formula: 't',
      total_contracts: 2,
      total_weighted_score: 110,
      normalized_score: 55,
      contributions: [],
    },
  },
  fix_sequence: [{
    order: 1,
    operation: 'reduce',
    description: 'split',
    estimated_cost_stroops: 0,
    estimated_time_minutes: 1,
    safer_alternative: 'Split into smaller txs',
  }],
  meta: {
    analyzed_at: new Date().toISOString(),
    ledger_sequence: 1,
    simulation_stale: false,
    network: 'testnet',
    processing_ms: 1,
    layer_timings_ms: { trace: 1, field: 1, gravity: 1 },
    unmapped_contracts: 0,
    confidence_bucket: 'MEDIUM',
  },
} as StructuredAnalyzeResponse;

describe('toPreSignPreview', () => {
  it('builds a wallet-facing hold preview', () => {
    const preview = toPreSignPreview(analysis);
    expect(preview.can_submit).toBe(false);
    expect(preview.requires_approval).toBe(true);
    expect(preview.decision).toBe('hold');
    expect(preview.contracts_touched).toEqual(['CA', 'CB']);
    expect(preview.safer_alternative).toContain('Split');
    expect(preview.token_movements[0].amount).toBe('10');
  });
});
