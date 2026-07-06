import { describe, it, expect } from 'vitest';
import { parseExecutionPath, parseFailurePoint, parseSimulationResult } from './parser.js';
import { computeVerdict, computeConfidence } from '../analyze.js';
import type { ExecutionStep } from '../types.js';

describe('parseExecutionPath', () => {
  it('returns a fallback step for invalid XDR', () => {
    const steps = parseExecutionPath('not-valid-xdr');
    expect(steps).toHaveLength(1);
    expect(steps[0].type).toBe('classic');
    expect(steps[0].description).toContain('Unable to parse');
  });

  it('returns a fallback step for empty XDR', () => {
    const steps = parseExecutionPath('');
    expect(steps).toHaveLength(1);
  });
});

describe('parseFailurePoint', () => {
  const executionPath: ExecutionStep[] = [
    { index: 0, type: 'invoke', contract_id: 'CABC123', function_name: 'disburse', description: 'test' },
  ];

  it('classifies auth failures', () => {
    const fp = parseFailurePoint('require_auth failed for address', executionPath);
    expect(fp.error_code).toBe('AUTH_REQUIRED');
    expect(fp.contract_id).toBe('CABC123');
    expect(fp.function_name).toBe('disburse');
  });

  it('classifies archived entry failures', () => {
    const fp = parseFailurePoint('entry archived: TTL expired', executionPath);
    expect(fp.error_code).toBe('ENTRY_ARCHIVED');
    expect(fp.root_cause).toContain('archived');
  });

  it('classifies insufficient balance failures', () => {
    const fp = parseFailurePoint('insufficient balance', executionPath);
    expect(fp.error_code).toBe('INSUFFICIENT_BALANCE');
  });

  it('defaults to SIMULATION_FAILED for unknown errors', () => {
    const fp = parseFailurePoint('unknown contract error', executionPath);
    expect(fp.error_code).toBe('SIMULATION_FAILED');
  });
});

describe('parseSimulationResult', () => {
  it('preserves real simulation and latest ledger metadata', () => {
    const result = parseSimulationResult(
      {
        success: true,
        latestLedger: 120,
        simulationLedger: 113,
        minResourceFee: '42',
        events: [],
      },
      'not-valid-xdr',
    );

    expect(result.simulation_context.ledgerSequence).toBe(113);
    expect(result.simulation_context.latestLedger).toBe(120);
    expect(result.staleness_warning).toBe(true);
  });

  it('does not flag fresh simulations as stale', () => {
    const result = parseSimulationResult(
      {
        success: false,
        latestLedger: 120,
        simulationLedger: 116,
        minResourceFee: '0',
        events: [],
        error: 'simulation failed',
      },
      'not-valid-xdr',
    );

    expect(result.simulation_context.ledgerSequence).toBe(116);
    expect(result.staleness_warning).toBe(false);
  });
});

describe('computeVerdict', () => {
  it('returns ABORT on simulation failure', () => {
    const { verdict } = computeVerdict(false, 0, 0.9, 0.75, false);
    expect(verdict).toBe('ABORT');
  });

  it('returns WARN on stale simulation', () => {
    const { verdict } = computeVerdict(true, 10, 0.9, 0.75, true);
    expect(verdict).toBe('WARN');
  });

  it('returns WARN when confidence below threshold', () => {
    const { verdict } = computeVerdict(true, 10, 0.5, 0.75, false);
    expect(verdict).toBe('WARN');
  });

  it('returns WARN on high blast radius', () => {
    const { verdict } = computeVerdict(true, 60, 0.9, 0.75, false);
    expect(verdict).toBe('WARN');
  });

  it('returns CLEAR on successful low-risk simulation', () => {
    const { verdict } = computeVerdict(true, 10, 0.9, 0.75, false);
    expect(verdict).toBe('CLEAR');
  });

  it('never returns CLEAR on stale simulation', () => {
    const { verdict } = computeVerdict(true, 0, 0.95, 0.75, true);
    expect(verdict).not.toBe('CLEAR');
  });
});

describe('computeConfidence', () => {
  it('returns low confidence on failure', () => {
    expect(computeConfidence(false, 0, false)).toBeLessThan(0.5);
  });

  it('reduces confidence on stale simulation', () => {
    const fresh = computeConfidence(true, 0, false);
    const stale = computeConfidence(true, 0, true);
    expect(stale).toBeLessThan(fresh);
  });

  it('increases confidence with manifest coverage', () => {
    const noManifest = computeConfidence(true, 0, false);
    const withManifest = computeConfidence(true, 1.0, false);
    expect(withManifest).toBeGreaterThan(noManifest);
  });
});
