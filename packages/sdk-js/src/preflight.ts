import type {
  AnalyzeRequest,
  AnalyzeResponse,
  DecisionAction,
  MeridianError,
  RiskItem,
  StructuredAnalyzeResponse,
  Verdict,
} from '@meridian/core';
import { analyze } from '@meridian/core';
import { MeridianClient } from './client.js';

export interface PreflightRequest extends AnalyzeRequest {
  /** When set, call the remote API instead of local @meridian/core engines. */
  client?: MeridianClient;
}

export interface PreSignPreview {
  product: 'MERIDIAN';
  /** Safe to present to the end user before they sign. */
  title: string;
  summary: string;
  verdict: Verdict;
  decision: DecisionAction;
  confidence: number;
  blast_radius: number;
  can_submit: boolean;
  requires_approval: boolean;
  top_risks: Array<Pick<RiskItem, 'severity' | 'title' | 'why_it_matters'>>;
  contracts_touched: string[];
  token_movements: Array<{
    description: string;
    amount?: string;
    from?: string;
    to?: string;
    source?: string;
  }>;
  safer_alternative?: string;
  /** Full structured analysis without BRIEF (when run locally). */
  analysis?: StructuredAnalyzeResponse;
  /** Full API analysis including BRIEF (when run via client). */
  response?: AnalyzeResponse;
}

function isMeridianError(value: unknown): value is MeridianError {
  return (
    typeof value === 'object'
    && value !== null
    && 'layer' in value
    && 'code' in value
    && 'hint' in value
  );
}

function buildTitle(decision: DecisionAction, verdict: Verdict): string {
  if (decision === 'submit' && verdict === 'CLEAR') return 'Looks safe to sign';
  if (decision === 'hold') return 'Hold — review before signing';
  if (decision === 'rewrite') return 'Do not sign — rewrite recommended';
  return `Review required (${verdict})`;
}

function buildSummary(input: {
  decision: DecisionAction;
  verdict: Verdict;
  blast: number;
  risks: RiskItem[];
  contracts: number;
}): string {
  const riskHint = input.risks[0]
    ? ` Top risk: ${input.risks[0].title}.`
    : '';
  if (input.decision === 'submit') {
    return `Simulation is clear across ${input.contracts} contract(s) with blast radius ${input.blast}.${riskHint}`;
  }
  if (input.decision === 'hold') {
    return `Hold this transaction. Blast radius ${input.blast} across ${input.contracts} contract(s).${riskHint}`;
  }
  return `Do not submit as-is. Verdict ${input.verdict}, blast radius ${input.blast}.${riskHint}`;
}

/**
 * Build a wallet / dapp pre-sign risk preview from a structured analysis.
 */
export function toPreSignPreview(
  analysis: StructuredAnalyzeResponse | AnalyzeResponse,
): PreSignPreview {
  const decision = analysis.decision.action;
  const blast = analysis.gravity.blast_radius;
  const contracts = [
    ...analysis.execution_graph.root_contracts,
    ...analysis.execution_graph.downstream_contracts,
  ];
  const uniqueContracts = [...new Set(contracts)];
  const safer = analysis.fix_sequence?.find((step) => step.safer_alternative)?.safer_alternative;

  return {
    product: 'MERIDIAN',
    title: buildTitle(decision, analysis.verdict),
    summary: buildSummary({
      decision,
      verdict: analysis.verdict,
      blast,
      risks: analysis.top_risks,
      contracts: uniqueContracts.length,
    }),
    verdict: analysis.verdict,
    decision,
    confidence: analysis.confidence,
    blast_radius: blast,
    can_submit: decision === 'submit' && analysis.verdict !== 'ABORT',
    requires_approval: decision === 'hold' || analysis.verdict === 'WARN',
    top_risks: analysis.top_risks.slice(0, 3).map((risk) => ({
      severity: risk.severity,
      title: risk.title,
      why_it_matters: risk.why_it_matters,
    })),
    contracts_touched: uniqueContracts,
    token_movements: analysis.execution_graph.token_movements.map((m) => ({
      description: m.description,
      amount: m.amount,
      from: m.from,
      to: m.to,
      source: m.source,
    })),
    safer_alternative: safer,
  };
}

/**
 * Wallet / dapp preflight: analyze an unsigned tx and return a pre-sign risk preview.
 *
 * Prefer passing `client` in browser/dapp contexts so analysis runs against the MERIDIAN API.
 * Without `client`, runs local `@meridian/core` engines (Node / server-side).
 */
export async function preflight(
  request: PreflightRequest,
): Promise<PreSignPreview | MeridianError> {
  const { client, ...analyzeRequest } = request;

  if (client) {
    const response = await client.analyze(analyzeRequest);
    const preview = toPreSignPreview(response);
    return { ...preview, response };
  }

  const analysis = await analyze(analyzeRequest);
  if (isMeridianError(analysis)) return analysis;

  const preview = toPreSignPreview(analysis);
  return { ...preview, analysis };
}
