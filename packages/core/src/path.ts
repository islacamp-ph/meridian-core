import type {
  ContractVersionDiff,
  EcosystemManifest,
  ExecutionDiff,
  ExpectedPathStep,
  FieldResult,
  LedgerValueDiff,
  PathDeltaStep,
  PathExpectation,
  RiskItem,
  StructuredAnalyzeResponse,
  TokenMovement,
} from './types.js';

/**
 * Compare actual invoke path against an expected path specification.
 */
export function evaluatePathExpectation(
  expected: ExpectedPathStep[],
  actualSteps: ExpectedPathStep[],
): PathExpectation {
  const actual = actualSteps;
  const matched: ExpectedPathStep[] = [];
  const missing: ExpectedPathStep[] = [];
  const used = new Set<number>();

  for (const step of expected) {
    const index = actual.findIndex((candidate, i) => {
      if (used.has(i)) return false;
      if (candidate.contract_id !== step.contract_id) return false;
      if (step.function_name && candidate.function_name !== step.function_name) return false;
      return true;
    });
    if (index >= 0) {
      used.add(index);
      matched.push(actual[index]);
    } else {
      missing.push(step);
    }
  }

  const unexpected = actual.filter((_, index) => !used.has(index));

  return {
    expected,
    actual,
    matched,
    missing,
    unexpected,
    matched_fully: missing.length === 0 && unexpected.length === 0,
  };
}

/**
 * Extract invoke path steps from a structured analysis result.
 */
export function extractInvokePath(result: StructuredAnalyzeResponse): ExpectedPathStep[] {
  return result.trace.execution_path
    .filter((step) => step.type === 'invoke' && step.contract_id)
    .map((step) => ({
      contract_id: step.contract_id!,
      function_name: step.function_name,
    }));
}

/**
 * Build contract version drift panel from FIELD upgrade warnings + manifest expectations.
 */
export function buildContractVersionDiffs(
  field: FieldResult,
  manifest?: EcosystemManifest,
  touched?: Set<string>,
): ContractVersionDiff[] {
  const byAddress = new Map<string, ContractVersionDiff>();

  for (const warning of field.upgrade_warnings) {
    if (touched && !touched.has(warning.contract_id)) continue;
    byAddress.set(warning.contract_id, {
      contract_id: warning.contract_id,
      name: warning.name,
      expected_wasm_hash: warning.expected_wasm_hash,
      on_chain_wasm_hash: warning.on_chain_wasm_hash,
      drift: true,
    });
  }

  for (const contract of manifest?.contracts ?? []) {
    if (!contract.expected_wasm_hash) continue;
    if (touched && !touched.has(contract.address)) continue;
    if (byAddress.has(contract.address)) continue;
    const node = field.dependency_graph.find((n) => n.address === contract.address);
    byAddress.set(contract.address, {
      contract_id: contract.address,
      name: contract.name,
      expected_wasm_hash: contract.expected_wasm_hash,
      on_chain_wasm_hash: node?.wasm_hash,
      drift: Boolean(node?.upgrade_risk),
    });
  }

  return [...byAddress.values()];
}

export function compareTokenMovements(
  a: TokenMovement[],
  b: TokenMovement[],
): { added: TokenMovement[]; removed: TokenMovement[] } {
  const key = (m: TokenMovement) =>
    [m.step_index ?? '', m.from ?? '', m.to ?? '', m.amount ?? '', m.asset ?? '', m.description].join('|');
  const setA = new Map(a.map((m) => [key(m), m]));
  const setB = new Map(b.map((m) => [key(m), m]));
  return {
    added: [...setB.entries()].filter(([k]) => !setA.has(k)).map(([, m]) => m),
    removed: [...setA.entries()].filter(([k]) => !setB.has(k)).map(([, m]) => m),
  };
}

export function compareInvokePaths(
  a: ExpectedPathStep[],
  b: ExpectedPathStep[],
): { added: PathDeltaStep[]; removed: PathDeltaStep[] } {
  const key = (s: ExpectedPathStep) => `${s.contract_id}|${s.function_name ?? ''}`;
  const setA = new Map(a.map((s) => [key(s), s]));
  const setB = new Map(b.map((s) => [key(s), s]));
  return {
    added: [...setB.entries()].filter(([k]) => !setA.has(k)).map(([, s]) => s),
    removed: [...setA.entries()].filter(([k]) => !setB.has(k)).map(([, s]) => s),
  };
}

export function compareValueDiffs(
  a: LedgerValueDiff[] = [],
  b: LedgerValueDiff[] = [],
): { added: LedgerValueDiff[]; removed: LedgerValueDiff[] } {
  const key = (d: LedgerValueDiff) => `${d.ledger_key}|${d.before ?? ''}|${d.after ?? ''}`;
  const setA = new Map(a.map((d) => [key(d), d]));
  const setB = new Map(b.map((d) => [key(d), d]));
  return {
    added: [...setB.entries()].filter(([k]) => !setA.has(k)).map(([, d]) => d),
    removed: [...setA.entries()].filter(([k]) => !setB.has(k)).map(([, d]) => d),
  };
}

export function buildEnrichedDiffSummary(input: {
  verdictChanged: boolean;
  decisionChanged: boolean;
  blastDelta: number;
  contractsAdded: string[];
  contractsRemoved: string[];
  risksAdded: RiskItem[];
  tokensAdded: number;
  pathChanged: boolean;
  versionDrift: number;
}): string {
  const parts: string[] = [];

  if (input.verdictChanged) parts.push('Verdict changed between A and B.');
  if (input.decisionChanged) parts.push('Submit decision changed between A and B.');
  if (input.blastDelta !== 0) {
    parts.push(`Blast radius delta: ${input.blastDelta > 0 ? '+' : ''}${input.blastDelta}.`);
  }
  if (input.contractsAdded.length > 0) {
    parts.push(`Added ${input.contractsAdded.length} contract touch(es).`);
  }
  if (input.contractsRemoved.length > 0) {
    parts.push(`Removed ${input.contractsRemoved.length} contract touch(es).`);
  }
  if (input.risksAdded.length > 0) {
    parts.push(`Introduced ${input.risksAdded.length} new risk(s): ${input.risksAdded[0].title}.`);
  }
  if (input.tokensAdded > 0) {
    parts.push(`Added ${input.tokensAdded} token movement(s).`);
  }
  if (input.pathChanged) parts.push('Invoke path differs between A and B.');
  if (input.versionDrift > 0) {
    parts.push(`${input.versionDrift} contract version drift(s) detected.`);
  }

  return parts.length > 0
    ? parts.join(' ')
    : 'No material execution or risk differences detected between A and B.';
}

export function emptyExecutionDiffExtras(): Pick<
  ExecutionDiff,
  | 'token_movements_added'
  | 'token_movements_removed'
  | 'path_delta'
  | 'contract_versions'
  | 'value_diffs_added'
  | 'value_diffs_removed'
> {
  return {
    token_movements_added: [],
    token_movements_removed: [],
    path_delta: { added: [], removed: [] },
    contract_versions: [],
    value_diffs_added: [],
    value_diffs_removed: [],
  };
}
