import {
  Address,
  FeeBumpTransaction,
  Operation,
  humanizeEvents,
  xdr,
  type SorobanDataBuilder,
} from '@stellar/stellar-sdk';
import type {
  AuthEntry,
  ExecutionStep,
  FailurePoint,
  FeeEstimate,
  LedgerEntryTTL,
  Network,
  ResourceUsage,
  SimulationContext,
  TraceResult,
  TTLWarning,
} from '../types.js';
import { parseTransactionFromXdr } from './network.js';
import type { RawSimulationResult } from './rpc.js';

const STALENESS_THRESHOLD = 5;
const TTL_WARNING_THRESHOLD = 100_000;

/**
 * Extract contract addresses from simulation footprint.
 *
 * @param sorobanData - Parsed Soroban resource/footprint data from a successful simulation
 * @returns Footprint contract addresses and ledger keys
 */
export function extractFootprint(
  sorobanData?: SorobanDataBuilder,
  ledgerSequence: number = 0,
  latestLedger: number = ledgerSequence,
): SimulationContext {
  const footprintContracts = new Set<string>();
  const readOnly: string[] = [];
  const readWrite: string[] = [];

  if (!sorobanData) {
    return {
      ledgerSequence,
      latestLedger,
      footprintContracts: [],
      readOnly: [],
      readWrite: [],
    };
  }

  for (const key of sorobanData.getReadOnly()) {
    readOnly.push(ledgerKeyToString(key));
    const contractId = extractContractFromLedgerKey(key);
    if (contractId) footprintContracts.add(contractId);
  }

  for (const key of sorobanData.getReadWrite()) {
    readWrite.push(ledgerKeyToString(key));
    const contractId = extractContractFromLedgerKey(key);
    if (contractId) footprintContracts.add(contractId);
  }

  return {
    ledgerSequence,
    latestLedger,
    footprintContracts: [...footprintContracts],
    readOnly,
    readWrite,
  };
}

/**
 * Merge two simulation contexts, combining footprint data from enforce and record simulations.
 *
 * @param primary - Primary simulation context (enforce mode)
 * @param secondary - Secondary context (record / record_allow_nonroot mode)
 * @returns Merged simulation context
 */
export function mergeSimulationContexts(
  primary: SimulationContext,
  secondary: SimulationContext,
): SimulationContext {
  const footprintContracts = [...new Set([
    ...primary.footprintContracts,
    ...secondary.footprintContracts,
  ])];
  const readOnly = [...new Set([...primary.readOnly, ...secondary.readOnly])];
  const readWrite = [...new Set([...primary.readWrite, ...secondary.readWrite])];

  return {
    ledgerSequence: primary.ledgerSequence,
    latestLedger: primary.latestLedger,
    footprintContracts,
    readOnly,
    readWrite,
  };
}

/**
 * Convert a ledger key to a base64 XDR string representation.
 *
 * @param key - Ledger key from footprint
 * @returns Base64-encoded XDR string
 */
function ledgerKeyToString(key: xdr.LedgerKey): string {
  return key.toXDR('base64');
}

/**
 * Extract the contract address from a ledger key, if it is a contract data entry.
 *
 * @param key - Ledger key from footprint
 * @returns Contract address (strkey) or undefined
 */
function extractContractFromLedgerKey(key: xdr.LedgerKey): string | undefined {
  if (key.switch() !== xdr.LedgerEntryType.contractData()) return undefined;

  try {
    const scAddress = key.contractData().contract();
    return Address.fromScAddress(scAddress).toString();
  } catch {
    return undefined;
  }
}

/**
 * Parse transaction XDR into execution steps for classic and Soroban operations.
 *
 * @param txXdr - Base64-encoded transaction XDR
 * @param network - Preferred network for passphrase resolution
 * @returns Execution steps
 */
export function parseExecutionPath(txXdr: string, network: Network = 'testnet'): ExecutionStep[] {
  const steps: ExecutionStep[] = [];
  let index = 0;

  try {
    const tx = parseTransactionFromXdr(txXdr, network);
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

    if (fn.switch() === xdr.HostFunctionType.hostFunctionTypeInvokeContract()) {
      const invoke = fn.invokeContract();
      const contractId = Address.fromScAddress(invoke.contractAddress()).toString();
      const functionName = invoke.functionName().toString();

      return {
        index,
        type: 'invoke',
        contract_id: contractId,
        function_name: functionName,
        description: `Invoke ${functionName} on ${contractId}`,
      };
    }

    return {
      index,
      type: 'invoke',
      description: `Invoke host function (${fn.switch().name})`,
    };
  }

  return {
    index,
    type: 'classic',
    description: `Classic operation: ${op.type}`,
  };
}

/**
 * Enrich execution path with read/write footprint steps and auth diagnostic steps.
 *
 * @param steps - Base execution steps from transaction operations
 * @param context - Simulation footprint context
 * @param authEntries - Parsed auth entries from diagnostic events
 * @returns Enriched execution steps
 */
export function enrichExecutionPath(
  steps: ExecutionStep[],
  context: SimulationContext,
  authEntries: AuthEntry[],
): ExecutionStep[] {
  const enriched = [...steps];
  let index = steps.length;

  for (const key of context.readOnly) {
    const contractId = extractContractFromLedgerKeyString(key);
    enriched.push({
      index: index++,
      type: 'read',
      contract_id: contractId,
      description: `Read ledger entry${contractId ? ` for ${contractId}` : ''}`,
      ledger_keys: [key],
    });
  }

  for (const key of context.readWrite) {
    const contractId = extractContractFromLedgerKeyString(key);
    enriched.push({
      index: index++,
      type: 'write',
      contract_id: contractId,
      description: `Write ledger entry${contractId ? ` for ${contractId}` : ''}`,
      ledger_keys: [key],
    });
  }

  for (const entry of authEntries) {
    enriched.push({
      index: index++,
      type: 'auth',
      contract_id: entry.contract_id ?? entry.address,
      description: `Authorization required for ${entry.contract_id ?? entry.address}`,
    });
  }

  return enriched;
}

/**
 * Extract auth entries from simulation diagnostic events.
 *
 * @param events - Diagnostic events from simulation
 * @returns Parsed auth entries
 */
export function parseAuthEntries(events: xdr.DiagnosticEvent[]): AuthEntry[] {
  const entries: AuthEntry[] = [];
  const humanized = humanizeEvents(events);

  for (const event of humanized) {
    const topicStrs = event.topics.map((t) => String(t));
    const topicStr = topicStrs.join(':');
    if (topicStr.includes('require_auth') || topicStr.includes('auth')) {
      entries.push({
        address: event.contractId ?? 'unknown',
        contract_id: event.contractId,
        credentials: topicStrs,
      });
    }
  }

  return entries;
}

/**
 * Compute fee estimate from transaction XDR and simulation result.
 *
 * @param txXdr - Base64-encoded transaction XDR
 * @param minResourceFee - Minimum resource fee from simulation (stroops string)
 * @param network - Preferred network for passphrase resolution
 * @returns Fee estimate with components
 */
export function computeFeeEstimate(
  txXdr: string,
  minResourceFee: string,
  network: Network = 'testnet',
): FeeEstimate {
  let classicBaseFee = 100;

  try {
    const tx = parseTransactionFromXdr(txXdr, network);
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
 * Extract resource usage from parsed Soroban simulation data.
 *
 * @param sorobanData - Parsed Soroban resource/footprint data from a successful simulation
 * @param memoryBytes - Memory bytes from simulation cost, when available
 * @returns Resource usage metrics
 */
export function extractResourceUsage(
  sorobanData?: SorobanDataBuilder,
  memoryBytes?: number,
): ResourceUsage {
  if (!sorobanData) {
    return {
      cpu_instructions: 0,
      memory_bytes: memoryBytes ?? 0,
      read_bytes: 0,
      write_bytes: 0,
    };
  }

  const resources = sorobanData.build().resources();
  return {
    cpu_instructions: resources.instructions(),
    memory_bytes: memoryBytes ?? 0,
    read_bytes: resources.readBytes(),
    write_bytes: resources.writeBytes(),
  };
}

/**
 * Check TTL on ledger entries and flag near-expiry or expired entries.
 *
 * @param ledgerKeys - Ledger keys from footprint (read-only and read-write)
 * @param ledgerSequence - Current ledger sequence
 * @param entryTtls - TTL metadata from getLedgerEntries
 * @returns TTL warnings
 */
export function checkTTLWarnings(
  ledgerKeys: string[],
  ledgerSequence: number,
  entryTtls: LedgerEntryTTL[],
): TTLWarning[] {
  const warnings: TTLWarning[] = [];
  const ttlByKey = new Map(entryTtls.map((entry) => [entry.ledger_key, entry.live_until_ledger_seq]));

  for (const key of ledgerKeys) {
    const liveUntil = ttlByKey.get(key);
    if (liveUntil === undefined) continue;

    const contractId = extractContractFromLedgerKeyString(key);
    if (!contractId) continue;

    const ttlRemaining = liveUntil - ledgerSequence;
    if (ttlRemaining <= 0) {
      warnings.push({
        contract_id: contractId,
        ledger_key: key,
        ttl_remaining: ttlRemaining,
        severity: 'CRITICAL',
      });
    } else if (ttlRemaining < TTL_WARNING_THRESHOLD) {
      warnings.push({
        contract_id: contractId,
        ledger_key: key,
        ttl_remaining: ttlRemaining,
        severity: 'WARNING',
      });
    }
  }

  return warnings;
}

/**
 * Best-effort extraction of a contract address from a base64-encoded XDR ledger key string.
 *
 * @param keyStr - Base64-encoded XDR ledger key
 * @returns Contract address (strkey) or undefined
 */
function extractContractFromLedgerKeyString(keyStr: string): string | undefined {
  try {
    const key = xdr.LedgerKey.fromXDR(keyStr, 'base64');
    return extractContractFromLedgerKey(key);
  } catch {
    return undefined;
  }
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
 * @param network - Network used for XDR parsing
 * @returns Structured TraceResult
 */
export function parseSimulationResult(
  raw: RawSimulationResult,
  txXdr: string,
  network: Network = 'testnet',
): TraceResult {
  const basePath = parseExecutionPath(txXdr, network);
  const simulationContext = extractFootprint(
    raw.sorobanData,
    raw.simulationLedger,
    raw.latestLedger,
  );
  const authEntries = parseAuthEntries(raw.events);
  const executionPath = enrichExecutionPath(basePath, simulationContext, authEntries);
  const stalenessDelta = raw.latestLedger - raw.simulationLedger;
  const isStale = stalenessDelta > STALENESS_THRESHOLD;

  if (!raw.success && raw.error) {
    return {
      success: false,
      failure_point: parseFailurePoint(raw.error, executionPath),
      execution_path: executionPath,
      auth_entries: authEntries,
      fee_estimate: computeFeeEstimate(txXdr, raw.minResourceFee, network),
      resource_usage: extractResourceUsage(raw.sorobanData, raw.memoryBytes),
      simulation_context: simulationContext,
      rpc_metrics: raw.rpcMetrics,
      staleness_warning: isStale,
    };
  }

  return {
    success: true,
    execution_path: executionPath,
    auth_entries: authEntries,
    fee_estimate: computeFeeEstimate(txXdr, raw.minResourceFee, network),
    resource_usage: extractResourceUsage(raw.sorobanData, raw.memoryBytes),
    simulation_context: simulationContext,
    rpc_metrics: raw.rpcMetrics,
    staleness_warning: isStale,
  };
}
