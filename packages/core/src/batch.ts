import { MERIDIAN_VERSION, analyze } from './analyze.js';
import type {
  BatchAnalyzeItemRequest,
  BatchAnalyzeItemResult,
  BatchAnalyzeResponse,
  BatchFailurePattern,
  BatchSummary,
  MeridianError,
  StructuredAnalyzeResponse,
} from './types.js';

export async function analyzeBatch(requests: BatchAnalyzeItemRequest[]): Promise<BatchAnalyzeResponse> {
  const items: BatchAnalyzeItemResult[] = [];

  for (const [index, request] of requests.entries()) {
    const id = request.id ?? `tx-${index + 1}`;
    const result = await analyze(request);

    if ('layer' in result) {
      items.push({
        id,
        network: request.network,
        status: 'error',
        risk_score: 100,
        error: result,
      });
      continue;
    }

    items.push({
      id,
      network: request.network,
      status: 'ok',
      risk_score: computeRiskScore(result),
      result,
    });
  }

  return {
    product: 'MERIDIAN',
    version: MERIDIAN_VERSION,
    items,
    summary: summarizeBatch(items),
  };
}

export function computeRiskScore(result: StructuredAnalyzeResponse): number {
  const verdictBase = result.verdict === 'ABORT' ? 70 : result.verdict === 'WARN' ? 35 : 0;
  const stalePenalty = result.meta.simulation_stale ? 10 : 0;
  const confidencePenalty = (1 - result.confidence) * 20;
  return Math.max(
    0,
    Math.min(100, Math.round((verdictBase + result.gravity.blast_radius + stalePenalty + confidencePenalty) * 100) / 100),
  );
}

export function summarizeBatch(items: BatchAnalyzeItemResult[]): BatchSummary {
  const successItems = items.filter((item): item is BatchAnalyzeItemResult & { result: StructuredAnalyzeResponse } =>
    item.status === 'ok' && Boolean(item.result),
  );
  const errorItems = items.filter((item): item is BatchAnalyzeItemResult & { error: MeridianError } =>
    item.status === 'error' && Boolean(item.error),
  );

  const highestRisk = [...items].sort((a, b) => b.risk_score - a.risk_score)[0];
  const averageConfidence = successItems.length === 0
    ? 0
    : Math.round((successItems.reduce((sum, item) => sum + item.result.confidence, 0) / successItems.length) * 100) / 100;

  return {
    total: items.length,
    ok: successItems.length,
    errors: errorItems.length,
    clear: successItems.filter((item) => item.result.verdict === 'CLEAR').length,
    warn: successItems.filter((item) => item.result.verdict === 'WARN').length,
    abort: successItems.filter((item) => item.result.verdict === 'ABORT').length,
    stale: successItems.filter((item) => item.result.meta.simulation_stale).length,
    average_confidence: averageConfidence,
    highest_risk_transaction: highestRisk
      ? {
          id: highestRisk.id,
          network: highestRisk.network,
          status: highestRisk.status,
          risk_score: highestRisk.risk_score,
          verdict: highestRisk.result?.verdict,
          blast_radius: highestRisk.result?.gravity.blast_radius,
          error_code: highestRisk.result?.trace.failure_point?.error_code ?? highestRisk.error?.code,
        }
      : undefined,
    common_failure_patterns: summarizeFailurePatterns(successItems, errorItems),
  };
}

function summarizeFailurePatterns(
  successItems: Array<BatchAnalyzeItemResult & { result: StructuredAnalyzeResponse }>,
  errorItems: Array<BatchAnalyzeItemResult & { error: MeridianError }>,
): BatchFailurePattern[] {
  const patterns = new Map<string, BatchFailurePattern>();

  for (const item of successItems) {
    const failurePoint = item.result.trace.failure_point;
    if (!failurePoint) continue;
    const key = `${failurePoint.error_code}:${failurePoint.root_cause}`;
    const existing = patterns.get(key) ?? {
      error_code: failurePoint.error_code,
      root_cause: failurePoint.root_cause,
      count: 0,
      item_ids: [],
    };
    existing.count++;
    existing.item_ids.push(item.id);
    patterns.set(key, existing);
  }

  for (const item of errorItems) {
    const key = `${item.error.code}:${item.error.error}`;
    const existing = patterns.get(key) ?? {
      error_code: item.error.code,
      root_cause: item.error.error,
      count: 0,
      item_ids: [],
    };
    existing.count++;
    existing.item_ids.push(item.id);
    patterns.set(key, existing);
  }

  return [...patterns.values()].sort((a, b) => b.count - a.count || a.error_code.localeCompare(b.error_code));
}
