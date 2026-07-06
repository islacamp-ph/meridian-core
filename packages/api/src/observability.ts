import { logger } from '@meridian/core';
import type { BatchAnalyzeResponse, ConfidenceBucket, MeridianError, StructuredAnalyzeResponse } from '@meridian/core';

interface ObservabilityState {
  requests_total: number;
  requests_by_route: Record<string, number>;
  analyze_requests_total: number;
  batch_requests_total: number;
  brief_fallbacks_total: number;
  brief_fallback_rate: number;
  confidence_distribution: Record<ConfidenceBucket, number>;
  unmapped_contracts_total: number;
  rpc_latest_ledger_fallbacks_total: number;
  rpc_latest_ledger_timeouts_total: number;
  error_responses_total: number;
}

const state: ObservabilityState = {
  requests_total: 0,
  requests_by_route: {},
  analyze_requests_total: 0,
  batch_requests_total: 0,
  brief_fallbacks_total: 0,
  brief_fallback_rate: 0,
  confidence_distribution: {
    LOW: 0,
    MEDIUM: 0,
    HIGH: 0,
  },
  unmapped_contracts_total: 0,
  rpc_latest_ledger_fallbacks_total: 0,
  rpc_latest_ledger_timeouts_total: 0,
  error_responses_total: 0,
};

export function recordRequestStart(requestId: string, method: string, path: string): void {
  state.requests_total++;
  state.requests_by_route[path] = (state.requests_by_route[path] ?? 0) + 1;
  logger.info('api:request:start', { requestId, method, path });
}

export function recordRequestComplete(
  requestId: string,
  method: string,
  path: string,
  status: number,
  durationMs: number,
): void {
  if (status >= 400) state.error_responses_total++;
  logger.info('api:request:complete', {
    requestId,
    method,
    path,
    status,
    duration_ms: durationMs,
  });
}

export function recordAnalyzeObservability(input: {
  requestId: string;
  route: string;
  analysis: StructuredAnalyzeResponse;
  briefMs?: number;
  briefFallbackUsed: boolean;
}): void {
  state.analyze_requests_total++;
  if (input.briefFallbackUsed) state.brief_fallbacks_total++;
  state.brief_fallback_rate =
    state.analyze_requests_total === 0
      ? 0
      : Math.round((state.brief_fallbacks_total / state.analyze_requests_total) * 10000) / 10000;

  state.confidence_distribution[input.analysis.meta.confidence_bucket]++;
  state.unmapped_contracts_total += input.analysis.meta.unmapped_contracts;
  if (input.analysis.trace.rpc_metrics?.latest_ledger_fallback) {
    state.rpc_latest_ledger_fallbacks_total++;
  }
  if (input.analysis.trace.rpc_metrics?.latest_ledger_timed_out) {
    state.rpc_latest_ledger_timeouts_total++;
  }

  logger.info('api:analyze:metrics', {
    requestId: input.requestId,
    route: input.route,
    verdict: input.analysis.verdict,
    confidence: input.analysis.confidence,
    confidence_bucket: input.analysis.meta.confidence_bucket,
    layer_timings_ms: {
      ...input.analysis.meta.layer_timings_ms,
      ...(input.briefMs !== undefined ? { brief: input.briefMs } : {}),
    },
    rpc_metrics: input.analysis.trace.rpc_metrics,
    brief_fallback_used: input.briefFallbackUsed,
    unknown_contracts: input.analysis.field.dependency_graph.filter((node) => !node.name).length,
    unmapped_contracts: input.analysis.meta.unmapped_contracts,
  });
}

export function recordBatchObservability(input: {
  requestId: string;
  route: string;
  result: BatchAnalyzeResponse;
}): void {
  state.batch_requests_total++;

  for (const item of input.result.items) {
    if (item.status !== 'ok' || !item.result) continue;
    state.confidence_distribution[item.result.meta.confidence_bucket]++;
    state.unmapped_contracts_total += item.result.meta.unmapped_contracts;
    if (item.result.trace.rpc_metrics?.latest_ledger_fallback) {
      state.rpc_latest_ledger_fallbacks_total++;
    }
    if (item.result.trace.rpc_metrics?.latest_ledger_timed_out) {
      state.rpc_latest_ledger_timeouts_total++;
    }
  }

  logger.info('api:batch:metrics', {
    requestId: input.requestId,
    route: input.route,
    total: input.result.summary.total,
    ok: input.result.summary.ok,
    errors: input.result.summary.errors,
    average_confidence: input.result.summary.average_confidence,
    highest_risk_transaction: input.result.summary.highest_risk_transaction,
    common_failure_patterns: input.result.summary.common_failure_patterns,
  });
}

export function recordEndpointError(requestId: string, route: string, error: MeridianError, status: number): void {
  logger.warn('api:error', {
    requestId,
    route,
    status,
    code: error.code,
    layer: error.layer,
    error: error.error,
  });
}

export function getObservabilitySnapshot() {
  return {
    ...state,
    requests_by_route: { ...state.requests_by_route },
    confidence_distribution: { ...state.confidence_distribution },
  };
}

export function resetObservabilityState(): void {
  state.requests_total = 0;
  state.requests_by_route = {};
  state.analyze_requests_total = 0;
  state.batch_requests_total = 0;
  state.brief_fallbacks_total = 0;
  state.brief_fallback_rate = 0;
  state.confidence_distribution = { LOW: 0, MEDIUM: 0, HIGH: 0 };
  state.unmapped_contracts_total = 0;
  state.rpc_latest_ledger_fallbacks_total = 0;
  state.rpc_latest_ledger_timeouts_total = 0;
  state.error_responses_total = 0;
}
