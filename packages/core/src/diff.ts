import { analyze, MERIDIAN_VERSION } from './analyze.js';
import type {
  AnalyzeDiffRequest,
  AnalyzeDiffResponse,
  EcosystemManifest,
  ExecutionDiff,
  MeridianError,
  RiskItem,
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
  _manifest?: EcosystemManifest,
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

  const blastDelta = Math.round((b.gravity.blast_radius - a.gravity.blast_radius) * 100) / 100;
  const verdictChanged = a.verdict !== b.verdict;
  const decisionChanged = a.decision.action !== b.decision.action;

  return {
    summary: buildDiffSummary({
      verdictChanged,
      decisionChanged,
      blastDelta,
      contractsAdded,
      contractsRemoved,
      risksAdded,
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
  };
}

function contractSet(result: StructuredAnalyzeResponse): Set<string> {
  return new Set([
    ...result.execution_graph.root_contracts,
    ...result.execution_graph.downstream_contracts,
    ...result.field.dependency_graph.map((n) => n.address),
  ]);
}

function buildDiffSummary(input: {
  verdictChanged: boolean;
  decisionChanged: boolean;
  blastDelta: number;
  contractsAdded: string[];
  contractsRemoved: string[];
  risksAdded: RiskItem[];
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

  return parts.length > 0
    ? parts.join(' ')
    : 'No material execution or risk differences detected between A and B.';
}
