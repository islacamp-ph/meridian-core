import { analyze, MERIDIAN_VERSION } from './analyze.js';
import {
  buildContractVersionDiffs,
  buildEnrichedDiffSummary,
  compareInvokePaths,
  compareTokenMovements,
  compareValueDiffs,
  extractInvokePath,
} from './path.js';
import type {
  AnalyzeDiffRequest,
  AnalyzeDiffResponse,
  EcosystemManifest,
  ExecutionDiff,
  MeridianError,
  StructuredAnalyzeResponse,
} from './types.js';

/**
 * Analyze two transactions and produce an execution / risk diff.
 */
export async function analyzeDiff(
  request: AnalyzeDiffRequest,
): Promise<AnalyzeDiffResponse | MeridianError> {
  const [resultA, resultB] = await Promise.all([
    analyze({
      tx: request.tx_a,
      network: request.network,
      ecosystem: request.ecosystem,
      options: request.options,
    }),
    analyze({
      tx: request.tx_b,
      network: request.network,
      ecosystem: request.ecosystem,
      options: request.options,
    }),
  ]);

  if ('layer' in resultA) return resultA;
  if ('layer' in resultB) return resultB;

  return {
    product: 'MERIDIAN',
    version: MERIDIAN_VERSION,
    a: resultA,
    b: resultB,
    diff: compareAnalyzeResults(resultA, resultB, request.ecosystem),
  };
}

/**
 * Compare two structured analyze results into an execution diff.
 */
export function compareAnalyzeResults(
  a: StructuredAnalyzeResponse,
  b: StructuredAnalyzeResponse,
  manifest?: EcosystemManifest,
): ExecutionDiff {
  const contractsA = contractSet(a);
  const contractsB = contractSet(b);
  const authA = new Set(a.execution_graph.auth_dependencies);
  const authB = new Set(b.execution_graph.auth_dependencies);
  const writesA = new Set(a.state_changes.contracts_written);
  const writesB = new Set(b.state_changes.contracts_written);
  const risksA = new Map(a.top_risks.map((r) => [r.id, r]));
  const risksB = new Map(b.top_risks.map((r) => [r.id, r]));

  const contractsAdded = [...contractsB].filter((c) => !contractsA.has(c));
  const contractsRemoved = [...contractsA].filter((c) => !contractsB.has(c));
  const authAdded = [...authB].filter((c) => !authA.has(c));
  const authRemoved = [...authA].filter((c) => !authB.has(c));
  const writesAdded = [...writesB].filter((c) => !writesA.has(c));
  const writesRemoved = [...writesA].filter((c) => !writesB.has(c));
  const risksAdded = [...risksB.values()].filter((r) => !risksA.has(r.id));
  const risksRemoved = [...risksA.values()].filter((r) => !risksB.has(r.id));

  const tokens = compareTokenMovements(
    a.execution_graph.token_movements,
    b.execution_graph.token_movements,
  );
  const pathDelta = compareInvokePaths(extractInvokePath(a), extractInvokePath(b));
  const valueDiffs = compareValueDiffs(a.state_changes.value_diffs, b.state_changes.value_diffs);
  const touched = new Set([...contractsA, ...contractsB]);
  const contractVersions = [
    ...buildContractVersionDiffs(a.field, manifest, touched),
    ...buildContractVersionDiffs(b.field, manifest, touched),
  ].filter((entry, index, all) =>
    all.findIndex((other) => other.contract_id === entry.contract_id) === index
  );

  const blastDelta = Math.round((b.gravity.blast_radius - a.gravity.blast_radius) * 100) / 100;
  const verdictChanged = a.verdict !== b.verdict;
  const decisionChanged = a.decision.action !== b.decision.action;
  const pathChanged = pathDelta.added.length > 0 || pathDelta.removed.length > 0;

  return {
    summary: buildEnrichedDiffSummary({
      verdictChanged,
      decisionChanged,
      blastDelta,
      contractsAdded,
      contractsRemoved,
      risksAdded,
      tokensAdded: tokens.added.length,
      pathChanged,
      versionDrift: contractVersions.filter((v) => v.drift).length,
    }),
    verdict_changed: verdictChanged,
    decision_changed: decisionChanged,
    blast_radius_delta: blastDelta,
    contracts_added: contractsAdded,
    contracts_removed: contractsRemoved,
    auth_added: authAdded,
    auth_removed: authRemoved,
    writes_added: writesAdded,
    writes_removed: writesRemoved,
    risks_added: risksAdded,
    risks_removed: risksRemoved,
    token_movements_added: tokens.added,
    token_movements_removed: tokens.removed,
    path_delta: pathDelta,
    contract_versions: contractVersions,
    path_expectation_a: a.path_expectation,
    path_expectation_b: b.path_expectation,
    value_diffs_added: valueDiffs.added,
    value_diffs_removed: valueDiffs.removed,
  };
}

function contractSet(result: StructuredAnalyzeResponse): Set<string> {
  return new Set([
    ...result.execution_graph.root_contracts,
    ...result.execution_graph.downstream_contracts,
    ...result.field.dependency_graph.map((n) => n.address),
  ]);
}
