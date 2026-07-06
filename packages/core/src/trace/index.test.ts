import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./rpc.js', () => ({
  resolveRpcUrl: vi.fn(),
  simulateTransaction: vi.fn(),
}));

vi.mock('./parser.js', () => ({
  parseSimulationResult: vi.fn(),
  parseExecutionPath: vi.fn(),
  extractFootprint: vi.fn(),
}));

import { trace } from './index.js';
import { parseSimulationResult } from './parser.js';
import { resolveRpcUrl, simulateTransaction } from './rpc.js';

const mockedResolveRpcUrl = vi.mocked(resolveRpcUrl);
const mockedSimulateTransaction = vi.mocked(simulateTransaction);
const mockedParseSimulationResult = vi.mocked(parseSimulationResult);

describe('trace', () => {
  beforeEach(() => {
    mockedResolveRpcUrl.mockReset();
    mockedSimulateTransaction.mockReset();
    mockedParseSimulationResult.mockReset();
  });

  it('uses the requested network to resolve RPC URLs', async () => {
    mockedResolveRpcUrl.mockReturnValue('https://mainnet.rpc');
    mockedSimulateTransaction.mockResolvedValue({
      success: true,
      latestLedger: 10,
      simulationLedger: 10,
      minResourceFee: '0',
      events: [],
      rpcMetrics: {
        simulate_transaction_ms: 5,
        get_latest_ledger_ms: 2,
        latest_ledger_fallback: false,
        latest_ledger_timed_out: false,
        timeout_ms: 30000,
      },
    });
    mockedParseSimulationResult.mockReturnValue({
      success: true,
      execution_path: [],
      auth_entries: [],
      fee_estimate: { classic_base_fee: 100, min_resource_fee: 0, total_fee: 100 },
      resource_usage: { cpu_instructions: 0, memory_bytes: 0, read_bytes: 0, write_bytes: 0 },
      simulation_context: { ledgerSequence: 10, latestLedger: 10, footprintContracts: [], readOnly: [], readWrite: [] },
      rpc_metrics: {
        simulate_transaction_ms: 5,
        get_latest_ledger_ms: 2,
        latest_ledger_fallback: false,
        latest_ledger_timed_out: false,
        timeout_ms: 30000,
      },
    });

    await trace('AAAA', { network: 'mainnet' });

    expect(mockedResolveRpcUrl).toHaveBeenCalledWith('mainnet');
    expect(mockedSimulateTransaction).toHaveBeenCalledWith('AAAA', 'https://mainnet.rpc', 30000);
  });

  it('uses an explicit rpcUrl without resolving by network', async () => {
    mockedSimulateTransaction.mockResolvedValue({
      success: true,
      latestLedger: 10,
      simulationLedger: 10,
      minResourceFee: '0',
      events: [],
      rpcMetrics: {
        simulate_transaction_ms: 5,
        get_latest_ledger_ms: 2,
        latest_ledger_fallback: false,
        latest_ledger_timed_out: false,
        timeout_ms: 30000,
      },
    });
    mockedParseSimulationResult.mockReturnValue({
      success: true,
      execution_path: [],
      auth_entries: [],
      fee_estimate: { classic_base_fee: 100, min_resource_fee: 0, total_fee: 100 },
      resource_usage: { cpu_instructions: 0, memory_bytes: 0, read_bytes: 0, write_bytes: 0 },
      simulation_context: { ledgerSequence: 10, latestLedger: 10, footprintContracts: [], readOnly: [], readWrite: [] },
      rpc_metrics: {
        simulate_transaction_ms: 5,
        get_latest_ledger_ms: 2,
        latest_ledger_fallback: false,
        latest_ledger_timed_out: false,
        timeout_ms: 30000,
      },
    });

    await trace('BBBB', { network: 'testnet', rpcUrl: 'https://custom.rpc' });

    expect(mockedResolveRpcUrl).not.toHaveBeenCalled();
    expect(mockedSimulateTransaction).toHaveBeenCalledWith('BBBB', 'https://custom.rpc', 30000);
  });
});
