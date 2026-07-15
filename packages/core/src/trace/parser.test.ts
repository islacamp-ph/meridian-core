import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Account,
  Address,
  Contract,
  Networks,
  SorobanDataBuilder,
  TransactionBuilder,
  BASE_FEE,
  xdr,
} from '@stellar/stellar-sdk';
import {
  checkTTLWarnings,
  extractResourceUsage,
  attachFootprintLedgerKeys,
  parseExecutionPath,
  parseExecutionPathFromDiagnostics,
  parseHumanizedDiagnosticEvents,
  parseFailurePoint,
  parseSimulationResult,
  decodeTokenEventsFromHumanized,
} from './parser.js';
import { computeVerdict, computeConfidence, generateFixSequence } from '../analyze.js';
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

  it('parses invokeHostFunction with ScAddress contract IDs', () => {
    const contractId = 'CA3D5KRYM6CB7OWQ6TWYRR3Z4T7GNZLKERYNZGGA5SOAOPIFY6YQGAXE';
    const contract = new Contract(contractId);
    const account = new Account('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF', '1');
    const tx = new TransactionBuilder(account, { fee: BASE_FEE })
      .setNetworkPassphrase(Networks.TESTNET)
      .setTimeout(30)
      .addOperation(contract.call('increment'))
      .build();

    const steps = parseExecutionPath(tx.toXDR(), 'testnet');
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({
      type: 'invoke',
      contract_id: contractId,
      function_name: 'increment',
    });
  });

  it('parses ScholarSeal canonical Soroban XDR fixture', () => {
    const fixturePath = join(
      dirname(fileURLToPath(import.meta.url)),
      '../../../../examples/scholar-seal/tx.xdr',
    );
    const txXdr = readFileSync(fixturePath, 'utf8').trim();
    const steps = parseExecutionPath(txXdr, 'testnet');

    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({
      type: 'invoke',
      contract_id: 'CA3D5KRYM6CB7OWQ6TWYRR3Z4T7GNZLKERYNZGGA5SOAOPIFY6YQGAXE',
      function_name: 'increment',
    });
  });
});

describe('attachFootprintLedgerKeys', () => {
  const contractId = 'CA3D5KRYM6CB7OWQ6TWYRR3Z4T7GNZLKERYNZGGA5SOAOPIFY6YQGAXE';
  const ledgerKey = xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: Address.fromString(contractId).toScAddress(),
      key: xdr.ScVal.scvSymbol('counter'),
      durability: xdr.ContractDataDurability.persistent(),
    }),
  ).toXDR('base64');

  it('attaches footprint ledger keys to diagnostic read/write steps', () => {
    const steps = attachFootprintLedgerKeys(
      [
        { index: 0, type: 'read', contract_id: contractId, description: 'Read ledger entry' },
        { index: 1, type: 'write', contract_id: contractId, description: 'Write ledger entry' },
      ],
      {
        ledgerSequence: 1,
        latestLedger: 1,
        footprintContracts: [contractId],
        readOnly: [ledgerKey],
        readWrite: [ledgerKey],
      },
    );

    expect(steps[0].ledger_keys).toEqual([ledgerKey]);
    expect(steps[1].ledger_keys).toEqual([ledgerKey]);
  });
});

/** Real testnet diagnostic events (increment call + storage error). */
const TESTNET_DIAGNOSTIC_EVENTS = [
  'AAAAAAAAAAAAAAAAAAAAAgAAAAAAAAADAAAADwAAAAdmbl9jYWxsAAAAAA0AAAAgNj6qOGeEH7rQ9O2Ix3nk/mblaiRw3JjA7JwHPQXHsQMAAAAPAAAACWluY3JlbWVudAAAAAAAAAE=',
  'AAAAAAAAAAAAAAAAAAAAAgAAAAAAAAACAAAADwAAAAVlcnJvcgAAAAAAAAIAAAADAAAAAwAAAA4AAAA2dHJ5aW5nIHRvIGdldCBub24tZXhpc3RpbmcgdmFsdWUgZm9yIGNvbnRyYWN0IGluc3RhbmNlAAA=',
];

describe('parseExecutionPathFromDiagnostics', () => {
  it('parses fn_call events into invoke steps with contract id and function name', () => {
    const events = TESTNET_DIAGNOSTIC_EVENTS.map((evt) => xdr.DiagnosticEvent.fromXDR(evt, 'base64'));
    const steps = parseExecutionPathFromDiagnostics(events);

    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({
      type: 'invoke',
      function_name: 'increment',
      contract_id: 'CA3D5KRYM6CB7OWQ6TWYRR3Z4T7GNZLKERYNZGGA5SOAOPIFY6YQGAXE',
    });
  });

  it('returns empty array when no events are provided', () => {
    expect(parseExecutionPathFromDiagnostics([])).toEqual([]);
  });

  it('parses cross-contract calls, storage access, and auth from humanized events', () => {
    const calleeBytes = Buffer.alloc(32, 2);
    const calleeId = 'CABAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAFNSZ';
    const callerId = 'CA3D5KRYM6CB7OWQ6TWYRR3Z4T7GNZLKERYNZGGA5SOAOPIFY6YQGAXE';

    const steps = parseHumanizedDiagnosticEvents([
      {
        contractId: callerId,
        topics: ['fn_call', calleeBytes, 'transfer'],
      },
      {
        contractId: callerId,
        topics: ['core_metrics', 'read_entry'],
      },
      {
        contractId: callerId,
        topics: ['core_metrics', 'write_entry'],
      },
      {
        contractId: callerId,
        topics: ['require_auth'],
        data: 'GABC',
      },
    ]);

    expect(steps.map((step) => step.type)).toEqual(['invoke', 'read', 'write', 'auth']);
    expect(steps[0]).toMatchObject({
      type: 'invoke',
      contract_id: calleeId,
      function_name: 'transfer',
    });
    expect(steps[0].description).toContain(callerId);
    expect(steps[1]).toMatchObject({ type: 'read', contract_id: callerId });
    expect(steps[2]).toMatchObject({ type: 'write', contract_id: callerId });
    expect(steps[3]).toMatchObject({ type: 'auth', contract_id: callerId });
  });
});

describe('parseSimulationResult diagnostic execution path', () => {
  it('uses simulation-native invoke steps when diagnostic events are present', () => {
    const events = TESTNET_DIAGNOSTIC_EVENTS.map((evt) => xdr.DiagnosticEvent.fromXDR(evt, 'base64'));
    const result = parseSimulationResult(
      {
        success: false,
        latestLedger: 120,
        simulationLedger: 120,
        minResourceFee: '0',
        events,
        rpcMetrics: {
          simulate_transaction_ms: 5,
          get_latest_ledger_ms: 2,
          latest_ledger_fallback: false,
          latest_ledger_timed_out: false,
          timeout_ms: 30000,
        },
        error: 'HostError: Error(Storage, MissingValue)',
      },
      'not-valid-xdr',
    );

    const invokeSteps = result.execution_path.filter((step) => step.type === 'invoke');
    expect(invokeSteps).toHaveLength(1);
    expect(invokeSteps[0].function_name).toBe('increment');
    expect(result.execution_path.some((step) => step.type === 'read')).toBe(false);
  });

  it('falls back to footprint enrichment when diagnostics lack fn_call events', () => {
    const contractId = 'CA3D5KRYM6CB7OWQ6TWYRR3Z4T7GNZLKERYNZGGA5SOAOPIFY6YQGAXE';
    const ledgerKey = xdr.LedgerKey.contractData(
      new xdr.LedgerKeyContractData({
        contract: Address.fromString(contractId).toScAddress(),
        key: xdr.ScVal.scvSymbol('counter'),
        durability: xdr.ContractDataDurability.persistent(),
      }),
    );

    const sorobanData = new SorobanDataBuilder();
    sorobanData.setReadOnly([ledgerKey]);

    const result = parseSimulationResult(
      {
        success: true,
        latestLedger: 120,
        simulationLedger: 120,
        minResourceFee: '42',
        events: [],
        sorobanData,
        rpcMetrics: {
          simulate_transaction_ms: 5,
          get_latest_ledger_ms: 2,
          latest_ledger_fallback: false,
          latest_ledger_timed_out: false,
          timeout_ms: 30000,
        },
      },
      'not-valid-xdr',
    );

    expect(result.execution_path.some((step) => step.type === 'read')).toBe(true);
    expect(result.execution_path.filter((step) => step.type === 'invoke')).toHaveLength(0);
  });
});

describe('checkTTLWarnings', () => {
  const contractId = 'CA3D5KRYM6CB7OWQ6TWYRR3Z4T7GNZLKERYNZGGA5SOAOPIFY6YQGAXE';
  const ledgerKey = xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: Address.fromString(contractId).toScAddress(),
      key: xdr.ScVal.scvSymbol('counter'),
      durability: xdr.ContractDataDurability.persistent(),
    }),
  ).toXDR('base64');

  it('flags expired entries as CRITICAL', () => {
    const warnings = checkTTLWarnings([ledgerKey], 1000, [
      { ledger_key: ledgerKey, live_until_ledger_seq: 999 },
    ]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].severity).toBe('CRITICAL');
    expect(warnings[0].ttl_remaining).toBe(-1);
    expect(warnings[0].contract_id).toBe(contractId);
  });

  it('flags near-expiry entries as WARNING', () => {
    const warnings = checkTTLWarnings([ledgerKey], 1000, [
      { ledger_key: ledgerKey, live_until_ledger_seq: 100_050 },
    ]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].severity).toBe('WARNING');
  });

  it('returns empty when TTL is healthy', () => {
    const warnings = checkTTLWarnings([ledgerKey], 1000, [
      { ledger_key: ledgerKey, live_until_ledger_seq: 2_000_000 },
    ]);
    expect(warnings).toHaveLength(0);
  });
});

describe('extractResourceUsage', () => {
  it('uses memoryBytes from simulation cost when provided', () => {
    const usage = extractResourceUsage(undefined, 42_000);
    expect(usage.memory_bytes).toBe(42_000);
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
        memoryBytes: 8192,
        rpcMetrics: {
          simulate_transaction_ms: 5,
          get_latest_ledger_ms: 2,
          latest_ledger_fallback: false,
          latest_ledger_timed_out: false,
          timeout_ms: 30000,
        },
      },
      'not-valid-xdr',
    );

    expect(result.simulation_context.ledgerSequence).toBe(113);
    expect(result.simulation_context.latestLedger).toBe(120);
    expect(result.staleness_warning).toBe(true);
    expect(result.resource_usage.memory_bytes).toBe(8192);
  });

  it('does not flag fresh simulations as stale', () => {
    const result = parseSimulationResult(
      {
        success: false,
        latestLedger: 120,
        simulationLedger: 116,
        minResourceFee: '0',
        events: [],
        rpcMetrics: {
          simulate_transaction_ms: 5,
          get_latest_ledger_ms: 2,
          latest_ledger_fallback: false,
          latest_ledger_timed_out: false,
          timeout_ms: 30000,
        },
        error: 'simulation failed',
      },
      'not-valid-xdr',
    );

    expect(result.simulation_context.ledgerSequence).toBe(116);
    expect(result.staleness_warning).toBe(false);
  });

  it('retains return values from simulation results', () => {
    const result = parseSimulationResult(
      {
        success: true,
        latestLedger: 120,
        simulationLedger: 120,
        minResourceFee: '1',
        events: [],
        results: [{ xdr: 'AAAA' }],
        rpcMetrics: {
          simulate_transaction_ms: 5,
          get_latest_ledger_ms: 2,
          latest_ledger_fallback: false,
          latest_ledger_timed_out: false,
          timeout_ms: 30000,
        },
      },
      'not-valid-xdr',
    );
    expect(result.return_values).toEqual(['AAAA']);
  });
});

describe('decodeTokenEventsFromHumanized', () => {
  it('decodes transfer topics into token movements', () => {
    const movements = decodeTokenEventsFromHumanized([
      {
        contractId: 'CTOKEN',
        topics: ['transfer', 'GAFROM', 'GBTO'],
        data: 12345,
      },
    ]);
    expect(movements).toHaveLength(1);
    expect(movements[0].source).toBe('decoded');
    expect(movements[0].from).toBe('GAFROM');
    expect(movements[0].to).toBe('GBTO');
    expect(movements[0].amount).toBe('12345');
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

describe('generateFixSequence', () => {
  it('returns undefined for CLEAR verdict', () => {
    expect(generateFixSequence({ verdict: 'CLEAR', traceSuccess: true })).toBeUndefined();
  });

  it('returns fix steps for ABORT verdict', () => {
    const steps = generateFixSequence({
      verdict: 'ABORT',
      traceSuccess: false,
      failureErrorCode: 'AUTH_REQUIRED',
    });
    expect(steps?.some((step) => step.operation === 'fix_auth')).toBe(true);
    expect(steps?.some((step) => step.operation === 'resimulate')).toBe(true);
  });

  it('returns fix steps for WARN verdict on stale simulation', () => {
    const steps = generateFixSequence({
      verdict: 'WARN',
      traceSuccess: true,
      warnings: ['Simulation ledger is stale (>5 ledgers behind latest)'],
    });
    expect(steps?.some((step) => step.operation === 'refresh_ledger')).toBe(true);
  });

  it('returns fix steps for WARN verdict on high blast radius', () => {
    const steps = generateFixSequence({
      verdict: 'WARN',
      traceSuccess: true,
      blastRadius: 75,
    });
    expect(steps?.some((step) => step.operation === 'reduce_scope')).toBe(true);
  });
});
