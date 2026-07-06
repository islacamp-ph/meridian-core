import { afterEach, describe, expect, it, vi } from 'vitest';
import { printAnalysis, printBatchAnalysis } from './output.js';
import type { AnalyzeResponse, BatchAnalyzeResponse } from '../internal/meridian-core.js';

const logs: string[] = [];

afterEach(() => {
  logs.length = 0;
  vi.restoreAllMocks();
});

function spyConsole() {
  vi.spyOn(console, 'log').mockImplementation((...args) => {
    logs.push(args.join(' '));
  });
}

function makeAnalysis(): AnalyzeResponse {
  return {
    product: 'MERIDIAN',
    version: '0.1.1',
    verdict: 'WARN',
    confidence: 0.72,
    trace: {
      success: true,
      execution_path: [{ index: 0, type: 'invoke', contract_id: 'CPAY', function_name: 'transfer', description: 'Invoke transfer on CPAY' }],
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
        contributions: [
          {
            address: 'CPAY',
            name: 'Payments',
            impact: 'WARNING',
            contract_score: 35,
            normalized_contribution: 35,
            reason: 'Contract appears directly in the execution path.',
            factors: [{ key: 'direct_touch', label: 'Directly touched by transaction', weight: 20, applied: true, reason: 'Contract appears directly in the execution path.' }],
          },
        ],
      },
      affected_contracts: [
        {
          address: 'CPAY',
          name: 'Payments',
          impact: 'WARNING',
          active_users: 1200,
          score: 35,
          reason: 'Contract appears directly in the execution path.',
          score_breakdown: {
            total: 35,
            factors: [{ key: 'direct_touch', label: 'Directly touched by transaction', weight: 20, applied: true, reason: 'Contract appears directly in the execution path.' }],
          },
        },
      ],
      critical: [],
      warning: ['CPAY'],
      safe: [],
      monitor: [],
      total_affected_users: 1200,
      recovery: 'FULL',
    },
    explainability: {
      operations: [{ index: 0, type: 'invoke', description: 'Invoke transfer on CPAY', contract_id: 'CPAY', function_name: 'transfer', touched_contracts: [{ address: 'CPAY', sources: ['execution_path', 'footprint'], impact: 'WARNING', impact_reason: 'Contract appears directly in the execution path.' }] }],
      contracts: [{ address: 'CPAY', name: 'Payments', sources: ['execution_path', 'footprint', 'manifest'], from_execution_path: true, from_footprint: true, from_manifest: true, touched_by_operations: [0], dependencies: [], impact: 'WARNING', impact_reason: 'Contract appears directly in the execution path.', active_users: 1200, criticality: 'HIGH' }],
      blast_radius: {
        formula: 'blast_radius = sum(contract_scores) / total_contracts, capped at 100',
        total_contracts: 1,
        total_weighted_score: 35,
        normalized_score: 35,
        contributions: [
          {
            address: 'CPAY',
            name: 'Payments',
            impact: 'WARNING',
            contract_score: 35,
            normalized_contribution: 35,
            reason: 'Contract appears directly in the execution path.',
            factors: [{ key: 'direct_touch', label: 'Directly touched by transaction', weight: 20, applied: true, reason: 'Contract appears directly in the execution path.' }],
          },
        ],
      },
    },
    brief: 'brief output',
    warnings: ['warn output'],
    meta: {
      analyzed_at: '2026-01-01T00:00:00.000Z',
      ledger_sequence: 5,
      simulation_stale: false,
      network: 'testnet',
      processing_ms: 10,
    },
  };
}

describe('printAnalysis', () => {
  it('prints explainability and score breakdown details', () => {
    spyConsole();
    printAnalysis(makeAnalysis());

    const output = logs.join('\n');
    expect(output).toContain('EXPLAINABILITY');
    expect(output).toContain('score_formula');
    expect(output).toContain('score=35');
    expect(output).toContain('direct_touch=20');
  });
});

describe('printBatchAnalysis', () => {
  it('prints batch summary and highest-risk item', () => {
    spyConsole();
    const { brief: _brief, ...structured } = makeAnalysis();
    const response: BatchAnalyzeResponse = {
      product: 'MERIDIAN',
      version: '0.1.1',
      items: [
        { id: 'tx-1', network: 'testnet', status: 'ok', risk_score: 55, result: structured },
        { id: 'tx-2', network: 'mainnet', status: 'error', risk_score: 100, error: { error: 'RPC unavailable', code: 'RPC_UNAVAILABLE', hint: 'retry later', layer: 'TRACE' } },
      ],
      summary: {
        total: 2,
        ok: 1,
        errors: 1,
        clear: 0,
        warn: 1,
        abort: 0,
        stale: 0,
        average_confidence: 0.72,
        highest_risk_transaction: { id: 'tx-2', network: 'mainnet', status: 'error', risk_score: 100, error_code: 'RPC_UNAVAILABLE' },
        common_failure_patterns: [{ error_code: 'RPC_UNAVAILABLE', root_cause: 'RPC unavailable', count: 1, item_ids: ['tx-2'] }],
      },
    };

    printBatchAnalysis(response);

    const output = logs.join('\n');
    expect(output).toContain('SUMMARY');
    expect(output).toContain('HIGHEST RISK');
    expect(output).toContain('RPC_UNAVAILABLE');
  });
});
