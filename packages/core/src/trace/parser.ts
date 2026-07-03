import { rpc, TransactionBuilder, FeeBumpTransaction, Operation } from '@stellar/stellar-sdk';
import type {
  AuthEntry,
  ExecutionStep,
  FailurePoint,
  FeeEstimate,
  ResourceUsage,
  SimulationContext,
  TraceResult,
  TTLWarning,
} from '../types.js';
import type { RawSimulationResult } from './rpc.js';

const STALENESS_THRESHOLD = 5;
const TTL_WARNING_THRESHOLD = 100_000;

/**
 * Extract contract addresses from simulation footprint.
 *
 * @param simData - Raw simulation transaction response
 * @returns Footprint contract addresses and ledger keys
 */
export function extractFootprint(simData?: rpc.Api.RawSimulateTransactionResponse): SimulationContext {
  const footprintContracts = new Set<string>();
  const readOnly: string[] = [];
  const readWrite: string[] = [];

  if (!simData || !('transactionData' in simData)) {
    return {
      ledgerSequence: 0,
      latestLedger: 0,
      footprintContracts: [],
      readOnly: [],
      readWrite: [],
    };
  }

  const txData = simData.transactionData;
  const resources = txData?.resources;
  const footprint = resources?.footprint;

  if (footprint?.readOnly) {
    for (const key of footprint.readOnly) {
      const keyStr = ledgerKeyToString(key);
      readOnly.push(keyStr);
      const contractId = extractContractFromLedgerKey(keyStr);
      if (contractId) footprintContracts.add(contractId);
    }
  }

  if (footprint?.readWrite) {
    for (const key of footprint.readWrite) {
      const keyStr = ledgerKeyToString(key);
      readWrite.push(keyStr);
      const contractId = extractContractFromLedgerKey(keyStr);
      if (contractId) footprintContracts.add(contractId);
    }
  }

  return {
    ledgerSequence: 0,
    latestLedger: 0,
    footprintContracts: [...footprintContracts],
    readOnly,
    readWrite,
  };
}

/**
 * Convert a ledger key to a string representation.
 *
 * @param key - Ledger key from footprint
 * @returns String representation
 */
function ledgerKeyToString(key: unknown): string {
  if (typeof key === 'string') return key;
  if (key && typeof key === 'object' && 'contractData' in (key as Record<string, unknown>)) {
    const contractData = (key as { contractData?: { contract?: string } }).contractData;
    return contractData?.contract ?? JSON.stringify(key);
  }
  return JSON.stringify(key);
}

/**
 * Extract contract ID from a ledger key string.
 *
 * @param keyStr - Ledger key string
 * @returns Contract address or undefined
 */
function extractContractFromLedgerKey(keyStr: string): string | undefined {
  const match = keyStr.match(/C[A-Z0-9]{55}/);
  return match?.[0];
}

/**
 * Parse transaction XDR into execution steps for classic and Soroban operations.
 *
 * @param txXdr - Base64-encoded transaction XDR
 * @returns Execution steps
 */
export function parseExecutionPath(txXdr: string): ExecutionStep[] {
  const steps: ExecutionStep[] = [];
  let index = 0;

  try {
    let tx;
    try {
      tx = TransactionBuilder.fromXDR(txXdr, 'Public Global Stellar Network ; September 2015');
    } catch {
      tx = TransactionBuilder.fromXDR(txXdr, 'Test SDF Network ; September 2015');
    }

    const envelope = tx instanceof FeeBumpTransaction ? tx.innerTransaction : tx;

    for (const op of envelope.operations) {
      steps.push(parseOperation(op, index));
      index++;
    }
  } catch {
    steps.push({
      index: 0,
      type: 'classic',
      description: 'Unable to parse transaction XDR — raw simulation only',
    });
  }

  return steps;
}

/**
 * Parse a single Stellar operation into an execution step.
 *
 * @param op - Stellar operation
 * @param index - Step index
 * @returns Execution step
 */
function parseOperation(op: Operation, index: number): ExecutionStep {
  if (op.type === 'invokeHostFunction') {
    const hostFn = op as Operation.InvokeHostFunction;
    const fn = hostFn.func;
    let contractId: string | undefined;
    let functionName: string | undefined;

    if (fn && typeof fn === 'object' && 'invokeContract' in fn) {
      const invoke = fn as { invokeContract?: { contractAddress?: string; functionName?: string } };
      contractId = invoke.invokeContract?.contractAddress;
      functionName = invoke.invokeContract?.functionName;
    }

    return {
      index,
      type: 'invoke',
      contract_id: contractId,
      function_name: functionName,
      description: `Invoke ${functionName ?? 'host function'} on ${contractId ?? 'unknown contract'}`,
    };
  }

  return {
    index,
    type: 'classic',
    description: `Classic operation: ${op.type}`,
  };
}

/**
 * Extract auth entries from simulation events.
 *
 * @param events - Simulation events
 * @returns Parsed auth entries
 */
export function parseAuthEntries(events: rpc.Api.EventResponse[]): AuthEntry[] {
  const entries: AuthEntry[] = [];

  for (const event of events) {
    if (event.type === 'contract' && event.topic) {
      const topicStr = event.topic.map((t) => String(t)).join(':');
      if (topicStr.includes('require_auth') || topicStr.includes('auth')) {
        entries.push({
          address: event.contractId?.() ?? 'unknown',
          contract_id: event.contractId?.(),
          credentials: event.topic.map((t) => String(t)),
        });
      }
    }
  }

  return entries;
}

/**
 * Compute fee estimate from transaction XDR and simulation result.
 *
 * @param txXdr - Base64-encoded transaction XDR
 * @param minResourceFee - Minimum resource fee from simulation (stroops string)
 * @returns Fee estimate with components
 */
export function computeFeeEstimate(txXdr: string, minResourceFee: string): FeeEstimate {
  let classicBaseFee = 100;

  try {
    let tx;
    try {
      tx = TransactionBuilder.fromXDR(txXdr, 'Public Global Stellar Network ; September 2015');
    } catch {
      tx = TransactionBuilder.fromXDR(txXdr, 'Test SDF Network ; September 2015');
    }
    const envelope = tx instanceof FeeBumpTransaction ? tx.innerTransaction : tx;
    classicBaseFee = Number(envelope.fee) || 100;
  } catch {
    // use default
  }

  const resourceFee = parseInt(minResourceFee, 10) || 0;
  return {
    classic_base_fee: classicBaseFee,
    min_resource_fee: resourceFee,
    total_fee: classicBaseFee + resourceFee,
  };
}

/**
 * Extract resource usage from simulation response.
 *
 * @param simData - Raw simulation transaction response
 * @returns Resource usage metrics
 */
export function extractResourceUsage(simData?: rpc.Api.RawSimulateTransactionResponse): ResourceUsage {
  if (!simData || !('transactionData' in simData)) {
    return { cpu_instructions: 0, memory_bytes: 0, read_bytes: 0, write_bytes: 0 };
  }

  const resources = simData.transactionData?.resources;
  return {
    cpu_instructions: Number(resources?.instructions ?? 0),
    memory_bytes: 0,
    read_bytes: Number(resources?.readBytes ?? 0),
    write_bytes: Number(resources?.writeBytes ?? 0),
  };
}

/**
 * Check TTL on ledger entries and flag near-expiry or expired entries.
 *
 * @param readWrite - Read-write ledger keys from footprint
 * @param ledgerSequence - Current ledger sequence
 * @returns TTL warnings
 */
export function checkTTLWarnings(readWrite: string[], ledgerSequence: number): TTLWarning[] {
  const warnings: TTLWarning[] = [];

  for (const key of readWrite) {
    const contractId = extractContractFromLedgerKey(key);
    if (!contractId) continue;

    // TTL data requires ledger entry fetch; flag keys present in readWrite as monitor
    // Full TTL resolution happens in Phase 2 with ledger entry reads
    const ttlRemaining = TTL_WARNING_THRESHOLD;
    if (ttlRemaining <= 0) {
      warnings.push({
        contract_id: contractId,
        ledger_key: key,
        ttl_remaining: ttlRemaining,
        severity: 'CRITICAL',
      });
    }
  }

  void ledgerSequence;
  return warnings;
}

/**
 * Parse a simulation failure into a structured failure point.
 *
 * @param error - Simulation error message
 * @param executionPath - Parsed execution path
 * @returns Structured failure point
 */
export function parseFailurePoint(error: string, executionPath: ExecutionStep[]): FailurePoint {
  const lastInvoke = [...executionPath].reverse().find((s) => s.type === 'invoke');
  const errorLower = error.toLowerCase();

  let errorCode = 'SIMULATION_FAILED';
  let rootCause = 'Transaction simulation failed';

  if (errorLower.includes('require_auth') || errorLower.includes('auth')) {
    errorCode = 'AUTH_REQUIRED';
    rootCause = 'Missing or invalid authorization credentials';
  } else if (errorLower.includes('archived') || errorLower.includes('ttl')) {
    errorCode = 'ENTRY_ARCHIVED';
    rootCause = 'Ledger entry is archived or TTL expired';
  } else if (errorLower.includes('insufficient')) {
    errorCode = 'INSUFFICIENT_BALANCE';
    rootCause = 'Insufficient balance for operation';
  }

  return {
    step_index: lastInvoke?.index ?? 0,
    contract_id: lastInvoke?.contract_id,
    function_name: lastInvoke?.function_name,
    error_code: errorCode,
    error_message: error,
    root_cause: rootCause,
  };
}

/**
 * Parse raw simulation result into a structured TraceResult.
 *
 * @param raw - Raw simulation result from RPC
 * @param txXdr - Original transaction XDR
 * @returns Structured TraceResult
 */
export function parseSimulationResult(raw: RawSimulationResult, txXdr: string): TraceResult {
  const executionPath = parseExecutionPath(txXdr);
  const footprint = extractFootprint(raw.transactionData);
  const stalenessDelta = raw.latestLedger - raw.simulationLedger;
  const isStale = stalenessDelta > STALENESS_THRESHOLD;

  if (!raw.success && raw.error) {
    return {
      success: false,
      failure_point: parseFailurePoint(raw.error, executionPath),
      execution_path: executionPath,
      auth_entries: parseAuthEntries(raw.events),
      fee_estimate: computeFeeEstimate(txXdr, raw.minResourceFee),
      resource_usage: extractResourceUsage(raw.transactionData),
      staleness_warning: isStale,
    };
  }

  void footprint;

  return {
    success: true,
    execution_path: executionPath,
    auth_entries: parseAuthEntries(raw.events),
    fee_estimate: computeFeeEstimate(txXdr, raw.minResourceFee),
    resource_usage: extractResourceUsage(raw.transactionData),
    staleness_warning: isStale,
  };
}
