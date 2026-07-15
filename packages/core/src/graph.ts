import type {
  EcosystemManifest,
  ExecutionGraph,
  ExecutionGraphEdge,
  ExecutionGraphNode,
  FieldResult,
  LedgerValueDiff,
  ManifestContract,
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
  const manifestByAddress = new Map(manifest?.contracts.map((c) => [c.address, c]) ?? []);
  const nodes = new Map<string, ExecutionGraphNode>();
  const edges: ExecutionGraphEdge[] = [];

  function ensureContract(
    address: string,
    depth?: number,
    source?: ExecutionGraphNode['source'],
    upgradeRisk?: boolean,
  ) {
    const manifestEntry = manifestByAddress.get(address);
    if (nodes.has(address)) {
      const existing = nodes.get(address)!;
      if (upgradeRisk) existing.upgrade_risk = true;
      if (depth !== undefined && (existing.depth === undefined || depth < existing.depth)) {
        existing.depth = depth;
      }
      applyManifestCounterparty(existing, manifestEntry);
      return;
    }
    const node: ExecutionGraphNode = {
      id: address,
      kind: 'contract',
      label: buildContractLabel(address, manifestEntry),
      address,
      depth,
      source,
      upgrade_risk: upgradeRisk,
    };
    applyManifestCounterparty(node, manifestEntry);
    nodes.set(address, node);
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
  const invokeTargets = invokeSteps.map((s) => s.contract_id!).filter(Boolean);

  for (const entry of trace.auth_entries) {
    const subject = entry.address;
    const target = entry.contract_id ?? invokeTargets[0] ?? subject;
    if (!target || target === 'unknown') continue;
    authDependencies.push(target);
    ensureContract(target, undefined, 'execution_path');

    if (subject && subject !== target) {
      if (!nodes.has(subject)) {
        nodes.set(subject, {
          id: subject,
          kind: 'account',
          label: subject,
          address: subject,
        });
      }
      edges.push({
        from: subject,
        to: target,
        type: 'auth',
        label: 'require_auth',
      });
    } else {
      for (const invokeTarget of invokeTargets.length > 0 ? invokeTargets : [target]) {
        edges.push({
          from: subject || (rootContracts[0] ?? target),
          to: invokeTarget,
          type: 'auth',
          label: 'require_auth',
        });
      }
    }
  }

  for (const step of trace.execution_path.filter((s) => s.type === 'auth' && s.contract_id)) {
    const target = step.contract_id!;
    if (!authDependencies.includes(target)) authDependencies.push(target);
    ensureContract(target);
    const authFrom = rootContracts[0] ?? invokeTargets[0] ?? target;
    edges.push({
      from: authFrom,
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

  const tokenMovements = collectTokenMovements(trace);
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
      const toId = movement.to.startsWith('C') ? movement.to : `asset-to:${movement.to}`;
      if (movement.to.startsWith('C')) {
        ensureContract(movement.to);
      } else if (!nodes.has(toId)) {
        nodes.set(toId, {
          id: toId,
          kind: 'account',
          label: movement.to,
          address: movement.to,
        });
      }
    }
    const fromId = movement.from
      ? (movement.from.startsWith('C') ? movement.from : `asset-from:${movement.from}`)
      : undefined;
    const toId = movement.to
      ? (movement.to.startsWith('C') ? movement.to : `asset-to:${movement.to}`)
      : undefined;
    if (fromId && toId) {
      edges.push({
        from: fromId,
        to: toId,
        type: 'token',
        label: [
          movement.asset ?? 'asset',
          movement.amount ? amountLabel(movement) : undefined,
          movement.source ?? 'heuristic',
        ].filter(Boolean).join(' · '),
        step_index: movement.step_index,
        source: movement.source,
      });
    } else if (toId && movement.step_index !== undefined) {
      edges.push({
        from: rootContracts[0] ?? `tx:${movement.step_index}`,
        to: toId,
        type: 'token',
        label: [
          movement.asset ?? 'asset-touch',
          movement.amount ? amountLabel(movement) : undefined,
          movement.source ?? 'heuristic',
        ].filter(Boolean).join(' · '),
        step_index: movement.step_index,
        source: movement.source,
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
 * Collect token movements: prefer decoded TRACE events, else heuristic/classic parse.
 */
export function collectTokenMovements(trace: TraceResult): TokenMovement[] {
  const decoded = (trace.token_events ?? []).map((m) => ({
    ...m,
    source: m.source ?? ('decoded' as const),
  }));
  if (decoded.length > 0) {
    return mergeTokenMovements(decoded, detectTokenMovementsHeuristic(trace));
  }
  return detectTokenMovementsHeuristic(trace);
}

/**
 * Summarize ledger state this transaction intends to read/write.
 */
export function buildStateChangeSummary(
  trace: TraceResult,
  field: FieldResult,
  valueDiffs?: LedgerValueDiff[],
): StateChangeSummary {
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
    ...(valueDiffs && valueDiffs.length > 0 ? { value_diffs: valueDiffs } : {}),
  };
}

function buildContractLabel(address: string, manifestEntry?: ManifestContract): string {
  if (!manifestEntry) return address;
  const bits = [manifestEntry.name];
  if (manifestEntry.role) bits.push(manifestEntry.role);
  if (manifestEntry.criticality) bits.push(manifestEntry.criticality);
  return bits.join(' · ');
}

function applyManifestCounterparty(node: ExecutionGraphNode, manifestEntry?: ManifestContract): void {
  if (!manifestEntry) return;
  if (manifestEntry.role) node.role = manifestEntry.role;
  if (manifestEntry.criticality) node.criticality = manifestEntry.criticality;
  if (manifestEntry.audit_status) node.audit_status = manifestEntry.audit_status;
  if (manifestEntry.upgradeable !== undefined) node.upgradeable = manifestEntry.upgradeable;
  if (manifestEntry.reputation_score !== undefined) node.reputation_score = manifestEntry.reputation_score;
  if (manifestEntry.deployed_at) node.deployed_at = manifestEntry.deployed_at;
  if (manifestEntry.deployed_ledger !== undefined) node.deployed_ledger = manifestEntry.deployed_ledger;
  if (!node.label || node.label === node.address) {
    node.label = buildContractLabel(node.address ?? node.id, manifestEntry);
  }
}

function amountLabel(movement: TokenMovement): string {
  return movement.amount ?? '';
}

function detectTokenMovementsHeuristic(trace: TraceResult): TokenMovement[] {
  const movements: TokenMovement[] = [];

  for (const step of trace.execution_path) {
    const desc = step.description;
    const descLower = desc.toLowerCase();
    const fn = step.function_name?.toLowerCase() ?? '';

    if (step.type === 'classic') {
      const classic = parseClassicPayment(desc);
      if (classic) {
        movements.push({
          step_index: step.index,
          description: desc,
          amount: classic.amount,
          to: classic.to,
          asset: classic.asset,
          source: 'classic',
        });
        continue;
      }
    }

    if (
      fn.includes('transfer')
      || fn.includes('payment')
      || fn.includes('swap')
      || fn.includes('withdraw')
      || fn.includes('deposit')
      || descLower.includes('transfer')
    ) {
      movements.push({
        step_index: step.index,
        to: step.contract_id,
        description: desc,
        asset: fn.includes('swap') ? 'pool-asset' : undefined,
        source: 'heuristic',
      });
    }
  }

  return movements;
}

/** Parse classic "Payment: {amount} → {dest}" descriptions. */
export function parseClassicPayment(description: string): {
  amount: string;
  to: string;
  asset?: string;
} | undefined {
  const match = description.match(/^Payment:\s*([^\s→]+)(?:\s+(\S+))?\s*→\s*(\S+)/i)
    ?? description.match(/^payment:\s*([^\s→]+)(?:\s+(\S+))?\s*→\s*(\S+)/i);
  if (!match) return undefined;
  return {
    amount: match[1],
    asset: match[2],
    to: match[3],
  };
}

function mergeTokenMovements(preferred: TokenMovement[], fallback: TokenMovement[]): TokenMovement[] {
  const keys = new Set(preferred.map(tokenKey));
  const merged = [...preferred];
  for (const movement of fallback) {
    if (!keys.has(tokenKey(movement))) merged.push(movement);
  }
  return merged;
}

function tokenKey(movement: TokenMovement): string {
  return [
    movement.step_index ?? '',
    movement.from ?? '',
    movement.to ?? '',
    movement.amount ?? '',
    movement.asset ?? '',
  ].join('|');
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

function contractFromLedgerKeyHint(
  key: string,
  field: FieldResult,
  trace: TraceResult,
): string | undefined {
  for (const step of trace.execution_path) {
    if (step.ledger_keys?.includes(key) && step.contract_id) {
      return step.contract_id;
    }
  }

  if (trace.simulation_context.footprintContracts.length === 1) {
    return trace.simulation_context.footprintContracts[0];
  }

  const footprint = new Set(trace.simulation_context.footprintContracts);
  const matches = field.dependency_graph.map((n) => n.address).filter((a) => footprint.has(a));
  return matches.length === 1 ? matches[0] : undefined;
}

function dedupeEdges(edges: ExecutionGraphEdge[]): ExecutionGraphEdge[] {
  const seen = new Set<string>();
  return edges.filter((edge) => {
    const key = `${edge.from}->${edge.to}:${edge.type}:${edge.label ?? ''}:${edge.step_index ?? ''}:${edge.source ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
