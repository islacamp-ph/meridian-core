import type {
  EcosystemManifest,
  ExecutionGraph,
  ExecutionGraphEdge,
  ExecutionGraphNode,
  FieldResult,
  StateChangeSummary,
  StateSurface,
  TokenMovement,
  TraceResult,
} from './types.js';

/**
 * Build a first-class execution graph: invokes, downstream deps, auth, state, tokens.
 */
export function buildExecutionGraph(
  trace: TraceResult,
  field: FieldResult,
  manifest?: EcosystemManifest,
): ExecutionGraph {
  const nameByAddress = new Map(manifest?.contracts.map((c) => [c.address, c.name]) ?? []);
  const nodes = new Map<string, ExecutionGraphNode>();
  const edges: ExecutionGraphEdge[] = [];

  function ensureContract(address: string, depth?: number, source?: ExecutionGraphNode['source'], upgradeRisk?: boolean) {
    if (nodes.has(address)) {
      const existing = nodes.get(address)!;
      if (upgradeRisk) existing.upgrade_risk = true;
      if (depth !== undefined && (existing.depth === undefined || depth < existing.depth)) {
        existing.depth = depth;
      }
      return;
    }
    nodes.set(address, {
      id: address,
      kind: 'contract',
      label: nameByAddress.get(address) ?? address,
      address,
      depth,
      source,
      upgrade_risk: upgradeRisk,
    });
  }

  for (const node of field.dependency_graph) {
    ensureContract(node.address, node.depth, node.source, node.upgrade_risk);
  }

  const invokeSteps = trace.execution_path.filter((step) => step.type === 'invoke' && step.contract_id);
  const rootContracts: string[] = [];
  let previousInvoke: string | undefined;

  for (const step of invokeSteps) {
    const contractId = step.contract_id!;
    ensureContract(contractId, 0, 'execution_path');
    if (!previousInvoke) {
      rootContracts.push(contractId);
    } else if (previousInvoke !== contractId) {
      edges.push({
        from: previousInvoke,
        to: contractId,
        type: 'downstream',
        label: step.function_name ?? 'invoke',
        step_index: step.index,
      });
    }
    edges.push({
      from: previousInvoke ?? `tx:${step.index}`,
      to: contractId,
      type: 'invoke',
      label: step.function_name ?? 'invoke',
      step_index: step.index,
    });
    if (!previousInvoke) {
      // synthetic root for the envelope-level invoke
      if (!nodes.has(`tx:${step.index}`)) {
        nodes.set(`tx:${step.index}`, {
          id: `tx:${step.index}`,
          kind: 'account',
          label: 'Transaction root',
        });
      }
    }
    previousInvoke = contractId;
  }

  // Manifest downstream edges
  for (const node of field.dependency_graph) {
    for (const dep of node.dependencies) {
      ensureContract(dep);
      edges.push({
        from: node.address,
        to: dep,
        type: 'downstream',
        label: 'manifest dependency',
      });
    }
  }

  const authDependencies: string[] = [];
  for (const entry of trace.auth_entries) {
    const target = entry.contract_id ?? entry.address;
    if (!target || target === 'unknown') continue;
    authDependencies.push(target);
    ensureContract(target, undefined, 'execution_path');
    const from = rootContracts[0] ?? target;
    edges.push({
      from,
      to: target,
      type: 'auth',
      label: 'require_auth',
    });
  }

  for (const step of trace.execution_path.filter((s) => s.type === 'auth' && s.contract_id)) {
    const target = step.contract_id!;
    if (!authDependencies.includes(target)) authDependencies.push(target);
    ensureContract(target);
    edges.push({
      from: rootContracts[0] ?? target,
      to: target,
      type: 'auth',
      label: 'auth',
      step_index: step.index,
    });
  }

  const readKeys = [...new Set(trace.simulation_context.readOnly)];
  const writeKeys = [...new Set(trace.simulation_context.readWrite)];

  for (const key of readKeys) {
    const contractId = contractFromLedgerKeyHint(key, field, trace);
    if (contractId) {
      ensureContract(contractId);
      edges.push({ from: rootContracts[0] ?? contractId, to: contractId, type: 'read' });
    }
  }
  for (const key of writeKeys) {
    const contractId = contractFromLedgerKeyHint(key, field, trace);
    if (contractId) {
      ensureContract(contractId);
      edges.push({ from: rootContracts[0] ?? contractId, to: contractId, type: 'write' });
    }
  }

  const tokenMovements = detectTokenMovements(trace);
  for (const movement of tokenMovements) {
    if (movement.from) {
      nodes.set(`asset-from:${movement.from}`, {
        id: `asset-from:${movement.from}`,
        kind: 'account',
        label: movement.from,
        address: movement.from,
      });
    }
    if (movement.to) {
      nodes.set(`asset-to:${movement.to}`, {
        id: `asset-to:${movement.to}`,
        kind: 'account',
        label: movement.to,
        address: movement.to,
      });
    }
    if (movement.from && movement.to) {
      edges.push({
        from: `asset-from:${movement.from}`,
        to: `asset-to:${movement.to}`,
        type: 'token',
        label: movement.asset ?? 'asset',
        step_index: movement.step_index,
      });
    }
  }

  const rootSet = new Set(rootContracts.length > 0
    ? rootContracts
    : field.dependency_graph.filter((n) => n.depth === 0).map((n) => n.address));

  const downstreamContracts = field.dependency_graph
    .map((n) => n.address)
    .filter((address) => !rootSet.has(address));

  return {
    nodes: [...nodes.values()],
    edges: dedupeEdges(edges),
    root_contracts: [...rootSet],
    downstream_contracts: [...new Set(downstreamContracts)],
    auth_dependencies: [...new Set(authDependencies)],
    state_surfaces: { read: readKeys, write: writeKeys },
    token_movements: tokenMovements,
  };
}

/**
 * Summarize ledger state this transaction intends to read/write.
 */
export function buildStateChangeSummary(trace: TraceResult, field: FieldResult): StateChangeSummary {
  const reads: StateSurface[] = [];
  const writes: StateSurface[] = [];
  const contractsRead = new Set<string>();
  const contractsWritten = new Set<string>();

  for (const key of trace.simulation_context.readOnly) {
    const contractId = contractFromLedgerKeyHint(key, field, trace);
    if (contractId) contractsRead.add(contractId);
    reads.push({
      ledger_key: key,
      contract_id: contractId,
      access: 'read',
      description: contractId
        ? `Read state for ${contractId}`
        : 'Read ledger entry',
    });
  }

  for (const key of trace.simulation_context.readWrite) {
    const contractId = contractFromLedgerKeyHint(key, field, trace);
    if (contractId) contractsWritten.add(contractId);
    writes.push({
      ledger_key: key,
      contract_id: contractId,
      access: 'write',
      description: contractId
        ? `Write / mutate state for ${contractId}`
        : 'Write ledger entry',
    });
  }

  // Also count write steps without ledger keys
  for (const step of trace.execution_path) {
    if (step.type === 'write' && step.contract_id) contractsWritten.add(step.contract_id);
    if (step.type === 'read' && step.contract_id) contractsRead.add(step.contract_id);
  }

  const irreversibleWrites = writes.length;
  const summary = buildStateSummaryText(reads.length, writes.length, contractsRead.size, contractsWritten.size);

  return {
    summary,
    reads,
    writes,
    irreversible_writes: irreversibleWrites,
    contracts_read: [...contractsRead],
    contracts_written: [...contractsWritten],
  };
}

function buildStateSummaryText(
  readCount: number,
  writeCount: number,
  contractsRead: number,
  contractsWritten: number,
): string {
  if (readCount === 0 && writeCount === 0) {
    return 'No ledger state surfaces detected in the simulation footprint.';
  }
  return [
    `Intends to read ${readCount} ledger surface(s) across ${contractsRead} contract(s)`,
    `and write ${writeCount} surface(s) across ${contractsWritten} contract(s).`,
    writeCount > 0 ? 'Writes are effectively irreversible once submitted.' : '',
  ].filter(Boolean).join(' ');
}

function detectTokenMovements(trace: TraceResult): TokenMovement[] {
  const movements: TokenMovement[] = [];

  for (const step of trace.execution_path) {
    const desc = step.description.toLowerCase();
    const fn = step.function_name?.toLowerCase() ?? '';

    if (step.type === 'classic' && desc.startsWith('payment:')) {
      movements.push({
        step_index: step.index,
        description: step.description,
      });
      continue;
    }

    if (
      fn.includes('transfer')
      || fn.includes('payment')
      || fn.includes('swap')
      || fn.includes('withdraw')
      || fn.includes('deposit')
      || desc.includes('transfer')
    ) {
      movements.push({
        step_index: step.index,
        to: step.contract_id,
        description: step.description,
        asset: fn.includes('swap') ? 'pool-asset' : undefined,
      });
    }
  }

  return movements;
}

function contractFromLedgerKeyHint(
  key: string,
  field: FieldResult,
  trace: TraceResult,
): string | undefined {
  // Prefer contracts already mapped that appear with this key on execution steps
  for (const step of trace.execution_path) {
    if (step.ledger_keys?.includes(key) && step.contract_id) {
      return step.contract_id;
    }
  }

  // Fall back: if only one footprint contract, attribute to it
  if (trace.simulation_context.footprintContracts.length === 1) {
    return trace.simulation_context.footprintContracts[0];
  }

  // Match against dependency graph contracts present in footprint
  const footprint = new Set(trace.simulation_context.footprintContracts);
  const matches = field.dependency_graph.map((n) => n.address).filter((a) => footprint.has(a));
  return matches.length === 1 ? matches[0] : undefined;
}

function dedupeEdges(edges: ExecutionGraphEdge[]): ExecutionGraphEdge[] {
  const seen = new Set<string>();
  return edges.filter((edge) => {
    const key = `${edge.from}->${edge.to}:${edge.type}:${edge.label ?? ''}:${edge.step_index ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
