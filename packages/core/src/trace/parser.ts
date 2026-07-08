import {
  Address,
  Asset,
  FeeBumpTransaction,
  Operation,
  StrKey,
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

  if (op.type === 'payment') {
    const payment = op as Operation.Payment;
    return {
      index,
      type: 'classic',
      description: `Payment: ${payment.amount} → ${payment.destination}`,
    };
  }

  if (op.type === 'createAccount') {
    const createAccount = op as Operation.CreateAccount;
    return {
      index,
      type: 'classic',
      description: `Create account ${createAccount.destination} (starting balance ${createAccount.startingBalance})`,
    };
  }

  if (op.type === 'changeTrust') {
    const changeTrust = op as Operation.ChangeTrust;
    const assetLabel = changeTrust.line instanceof Asset
      ? changeTrust.line.getCode()
      : 'liquidity pool';
    return {
      index,
      type: 'classic',
      description: `Change trust: ${assetLabel} (limit ${changeTrust.limit})`,
    };
  }

  if (op.type === 'pathPaymentStrictSend' || op.type === 'pathPaymentStrictReceive') {
    return {
      index,
      type: 'classic',
      description: `Path payment (${op.type})`,
    };
  }

  if (op.type === 'manageData') {
    const manageData = op as Operation.ManageData;
    return {
      index,
      type: 'classic',
      description: `Manage data: ${manageData.name}`,
    };
  }

  return {
    index,
    type: 'classic',
    description: `Classic operation: ${op.type}`,
  };
}

interface HumanizedDiagnosticEvent {
  type?: string;
  contractId?: string;
  topics: unknown[];
  data?: unknown;
}

/**
 * Decode a contract id topic from a diagnostic event (Buffer bytes or C... strkey).
 */
function decodeContractTopic(topic: unknown): string | undefined {
  if (typeof topic === 'string' && topic.startsWith('C')) {
    return topic;
  }
  if (Buffer.isBuffer(topic)) {
    return StrKey.encodeContract(topic);
  }
  if (topic instanceof Uint8Array) {
    return StrKey.encodeContract(Buffer.from(topic));
  }
  return undefined;
}

function topicSymbol(topic: unknown): string | undefined {
  return typeof topic === 'string' ? topic : undefined;
}

/**
 * Build execution steps from already-humanized diagnostic events.
 * Used by {@link parseExecutionPathFromDiagnostics} and available for testing.
 */
export function parseHumanizedDiagnosticEvents(humanized: HumanizedDiagnosticEvent[]): ExecutionStep[] {
  const steps: ExecutionStep[] = [];
  let index = 0;

  for (const event of humanized) {
    const topics = event.topics;
    const head = topicSymbol(topics[0]) ?? '';

    if (head === 'fn_call') {
      const contractId = decodeContractTopic(topics[1]);
      const functionName = topicSymbol(topics[2]);
      const callerId = event.contractId;
      steps.push({
        index: index++,
        type: 'invoke',
        contract_id: contractId,
        function_name: functionName,
        description: callerId
          ? `Invoke ${functionName ?? 'contract'} on ${contractId ?? 'unknown'} (from ${callerId})`
          : `Invoke ${functionName ?? 'contract'} on ${contractId ?? 'unknown'}`,
      });
      continue;
    }

    if (head === 'core_metrics') {
      const metric = topicSymbol(topics[1]) ?? '';
      if (metric === 'read_entry') {
        steps.push({
          index: index++,
          type: 'read',
          contract_id: event.contractId,
          description: `Read ledger entry${event.contractId ? ` for ${event.contractId}` : ''}`,
        });
        continue;
      }
      if (metric === 'write_entry') {
        steps.push({
          index: index++,
          type: 'write',
          contract_id: event.contractId,
          description: `Write ledger entry${event.contractId ? ` for ${event.contractId}` : ''}`,
        });
        continue;
      }
    }

    if (head === 'read_entry') {
      steps.push({
        index: index++,
        type: 'read',
        contract_id: event.contractId,
        description: `Read ledger entry${event.contractId ? ` for ${event.contractId}` : ''}`,
      });
      continue;
    }

    if (head === 'write_entry') {
      steps.push({
        index: index++,
        type: 'write',
        contract_id: event.contractId,
        description: `Write ledger entry${event.contractId ? ` for ${event.contractId}` : ''}`,
      });
      continue;
    }

    const topicStr = topics.map((topic) => topicSymbol(topic) ?? '').join(':');
    if (
      head === 'require_auth'
      || topicStr.includes('require_auth')
      || (head === 'error' && topicStr.toLowerCase().includes('auth'))
    ) {
      const target = event.contractId ?? (typeof event.data === 'string' ? event.data : undefined);
      steps.push({
        index: index++,
        type: 'auth',
        contract_id: target,
        description: `Authorization required${target ? ` for ${target}` : ''}`,
      });
    }
  }

  return steps;
}

/**
 * Build an ordered execution path from simulation diagnostic events.
 * Reconstructs invoke → read → write → auth steps as they occurred during simulation,
 * including cross-contract calls not visible in static transaction XDR.
 *
 * @param events - Diagnostic events from simulateTransaction RPC
 * @returns Simulation-native execution steps (empty when no diagnostic events)
 */
export function parseExecutionPathFromDiagnostics(events: xdr.DiagnosticEvent[]): ExecutionStep[] {
  if (events.length === 0) return [];
  return parseHumanizedDiagnosticEvents(humanizeEvents(events) as HumanizedDiagnosticEvent[]);
}

function extractClassicSteps(steps: ExecutionStep[]): ExecutionStep[] {
  return steps.filter((step) => step.type === 'classic');
}

function appendAuthSteps(
  steps: ExecutionStep[],
  authEntries: AuthEntry[],
): ExecutionStep[] {
  const existing = new Set(
    steps
      .filter((step) => step.type === 'auth')
      .map((step) => step.contract_id)
      .filter((value): value is string => Boolean(value)),
  );
  const result = [...steps];
  let index = steps.length;

  for (const entry of authEntries) {
    const target = entry.contract_id ?? entry.address;
    if (existing.has(target)) continue;
    existing.add(target);
    result.push({
      index: index++,
      type: 'auth',
      contract_id: target,
      description: `Authorization required for ${target}`,
    });
  }

  return result;
}

function reindexSteps(steps: ExecutionStep[]): ExecutionStep[] {
  return steps.map((step, index) => ({ ...step, index }));
}

/**
 * Attach footprint ledger keys to read/write execution steps by contract id.
 */
export function attachFootprintLedgerKeys(
  steps: ExecutionStep[],
  context: SimulationContext,
): ExecutionStep[] {
  const keysByContract = new Map<string, { read: string[]; write: string[] }>();

  for (const key of context.readOnly) {
    const contractId = extractContractFromLedgerKeyString(key);
    if (!contractId) continue;
    const entry = keysByContract.get(contractId) ?? { read: [], write: [] };
    entry.read.push(key);
    keysByContract.set(contractId, entry);
  }

  for (const key of context.readWrite) {
    const contractId = extractContractFromLedgerKeyString(key);
    if (!contractId) continue;
    const entry = keysByContract.get(contractId) ?? { read: [], write: [] };
    entry.write.push(key);
    keysByContract.set(contractId, entry);
  }

  return steps.map((step) => {
    if (!step.contract_id || step.ledger_keys?.length) return step;
    const keys = keysByContract.get(step.contract_id);
    if (!keys) return step;

    const ledgerKeys = step.type === 'write' ? keys.write : step.type === 'read' ? keys.read : [];
    if (ledgerKeys.length === 0) return step;

    return { ...step, ledger_keys: ledgerKeys };
  });
}

/**
 * Combine XDR-parsed classic ops with simulation-native diagnostic steps,
 * or fall back to footprint enrichment when diagnostics are unavailable.
 */
function buildExecutionPath(
  txXdr: string,
  network: Network,
  events: xdr.DiagnosticEvent[],
  context: SimulationContext,
  authEntries: AuthEntry[],
): ExecutionStep[] {
  const diagnosticSteps = parseExecutionPathFromDiagnostics(events);
  const xdrSteps = parseExecutionPath(txXdr, network);

  if (diagnosticSteps.some((step) => step.type === 'invoke')) {
    const classicSteps = extractClassicSteps(xdrSteps);
    const combined = reindexSteps(appendAuthSteps([...classicSteps, ...diagnosticSteps], authEntries));
    return attachFootprintLedgerKeys(combined, context);
  }

  return enrichExecutionPath(xdrSteps, context, authEntries);
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
  const simulationContext = extractFootprint(
    raw.sorobanData,
    raw.simulationLedger,
    raw.latestLedger,
  );
  const authEntries = parseAuthEntries(raw.events);
  const executionPath = buildExecutionPath(txXdr, network, raw.events, simulationContext, authEntries);
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
