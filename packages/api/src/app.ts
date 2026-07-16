import { cors } from 'hono/cors';
import { createMiddleware } from 'hono/factory';
import { Hono } from 'hono';
import {
  analyze,
  analyzeBatch,
  analyzeDiff,
  buildFieldGraph,
  MERIDIAN_VERSION,
  scoreGravity,
  trace,
} from '@meridian/core';
import type {
  AnalyzeDiffRequest,
  AnalyzeRequest,
  AnalyzeResponse,
  BatchAnalyzeItemRequest,
  FieldResult,
  GravityResult,
  MeridianError,
  TraceResult,
} from '@meridian/core';
import { synthesizeBrief } from '@meridian/ai';
import { getCachedLayerResult, setCachedLayerResult } from './cache/index.js';
import { authMiddleware } from './middleware/auth.js';
import { bodyLimitMiddleware } from './middleware/bodyLimit.js';
import { rateLimitMiddleware } from './middleware/rateLimit.js';
import {
  getObservabilitySnapshot,
  recordAnalyzeObservability,
  recordBatchObservability,
  recordEndpointError,
  recordRequestComplete,
  recordRequestStart,
} from './observability.js';
import { openApiDocsHtml, openApiDocument } from './openapi.js';
import {
  parseAnalyzeDiffRequest,
  parseAnalyzeRequest,
  parseBatchAnalyzeRequest,
  parseFieldRequest,
  parseGravityRequest,
  parseScreenRequest,
  parseTraceRequest,
  parseWebhookRegisterRequest,
  type AnalyzeDiffRequestBody,
  type BatchAnalyzeRequestBody,
  type FieldRequestBody,
  type GravityRequestBody,
  type ScreenRequestBody,
  type TraceRequestBody,
  type ValidationResult,
  type WebhookRegisterBody,
} from './validation.js';
import {
  buildScreeningPolicyRules,
  mergeScreeningOptions,
  toScreeningResult,
} from './screening.js';
import {
  deleteWebhook,
  dispatchWebhookEvent,
  eventsForAnalysis,
  listWebhooks,
  registerWebhook,
} from './webhooks.js';

type Env = {
  Variables: {
    requestId: string;
    requestStartedAt: number;
    analyzeBody?: AnalyzeRequest;
    analyzeDiffBody?: AnalyzeDiffRequestBody;
    batchAnalyzeBody?: BatchAnalyzeRequestBody;
    screenBody?: ScreenRequestBody;
    webhookBody?: WebhookRegisterBody;
    traceBody?: TraceRequestBody;
    fieldBody?: FieldRequestBody;
    gravityBody?: GravityRequestBody;
  };
};

const app = new Hono<Env>();

function parseCorsOrigins(): string | string[] {
  const raw = process.env.CORS_ORIGINS;
  if (!raw || raw === '*') return '*';
  return raw.split(',').map((origin) => origin.trim()).filter(Boolean);
}

/**
 * Check if a value is a MeridianError.
 */
function isMeridianError(value: unknown): value is MeridianError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'layer' in value &&
    'code' in value &&
    'hint' in value
  );
}

function invalidRequest(message: string, hint: string, details?: string[]) {
  return {
    error: message,
    code: 'INVALID_REQUEST',
    hint,
    layer: 'TRACE',
    ...(details && details.length > 0 ? { details } : {}),
  };
}

function validatedJsonBody<Key extends keyof Env['Variables'], T>(
  key: Key,
  parser: (value: unknown) => ValidationResult<T>,
) {
  return createMiddleware<Env>(async (c, next) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      const failure = invalidRequest('Invalid JSON request body', 'Send a valid JSON request body.');
      return c.json(failure, 400);
    }

    const parsed = parser(body);
    if (!parsed.success) {
      return c.json(
        invalidRequest(parsed.error.message, parsed.error.hint, parsed.error.details),
        400,
      );
    }

    c.set(key, parsed.data as Env['Variables'][Key]);
    await next();
  });
}

function manifestCacheSuffix(ecosystem: AnalyzeRequest['ecosystem']): string {
  if (!ecosystem) return '';
  return ecosystem.name ?? 'manifest';
}

function analyzeCacheSuffix(
  ecosystem: AnalyzeRequest['ecosystem'],
  options: AnalyzeRequest['options'],
): string {
  const parts: string[] = [];
  const manifest = manifestCacheSuffix(ecosystem);
  if (manifest) parts.push(manifest);
  if (options?.policy_rules?.length) {
    parts.push(`policy-${JSON.stringify(options.policy_rules)}`);
  }
  return parts.join(':');
}

function briefInputFromAnalysis(analysis: Omit<AnalyzeResponse, 'brief'>) {
  return {
    verdict: analysis.verdict,
    confidence: analysis.confidence,
    decision: analysis.decision,
    top_risks: analysis.top_risks,
    policy: analysis.policy,
    trace: analysis.trace,
    field: analysis.field,
    gravity: analysis.gravity,
    fix_sequence: analysis.fix_sequence,
    warnings: analysis.warnings,
  };
}

async function cachedTrace(
  tx: string,
  network: TraceRequestBody['network'],
): Promise<TraceResult | MeridianError> {
  const cached = await getCachedLayerResult<TraceResult>('trace', network, tx);
  if (cached) return cached;

  const result = await trace(tx, { network });
  if (!isMeridianError(result)) {
    await setCachedLayerResult('trace', network, tx, result.simulation_context.ledgerSequence, result);
  }
  return result;
}

async function cachedField(
  tx: string,
  network: FieldRequestBody['network'],
  ecosystem?: FieldRequestBody['ecosystem'],
): Promise<FieldResult | MeridianError> {
  const suffix = manifestCacheSuffix(ecosystem);
  const traceResult = await cachedTrace(tx, network);
  if (isMeridianError(traceResult)) return traceResult;

  const cached = await getCachedLayerResult<FieldResult>(
    'field',
    network,
    tx,
    traceResult.simulation_context.latestLedger,
    suffix,
  );
  if (cached) return cached;

  const fieldResult = await buildFieldGraph(traceResult, traceResult.simulation_context, {
    network,
    manifest: ecosystem,
    txXdr: tx,
  });

  await setCachedLayerResult(
    'field',
    network,
    tx,
    traceResult.simulation_context.ledgerSequence,
    fieldResult,
    { suffix },
  );

  return fieldResult;
}

async function cachedGravity(
  tx: string,
  network: GravityRequestBody['network'],
  ecosystem?: GravityRequestBody['ecosystem'],
): Promise<GravityResult | MeridianError> {
  const suffix = manifestCacheSuffix(ecosystem);
  const traceResult = await cachedTrace(tx, network);
  if (isMeridianError(traceResult)) return traceResult;

  const cached = await getCachedLayerResult<GravityResult>(
    'gravity',
    network,
    tx,
    traceResult.simulation_context.latestLedger,
    suffix,
  );
  if (cached) return cached;

  const fieldResult = await cachedField(tx, network, ecosystem);
  if (isMeridianError(fieldResult)) return fieldResult;

  const gravityResult = scoreGravity(traceResult, fieldResult, { manifest: ecosystem });
  await setCachedLayerResult(
    'gravity',
    network,
    tx,
    traceResult.simulation_context.ledgerSequence,
    gravityResult,
    { suffix },
  );

  return gravityResult;
}

app.use('*', cors({ origin: parseCorsOrigins() }));
app.use('*', bodyLimitMiddleware);
app.use('*', rateLimitMiddleware);
app.use('*', authMiddleware);

app.use('*', async (c, next) => {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  c.set('requestId', requestId);
  c.set('requestStartedAt', startedAt);

  recordRequestStart(requestId, c.req.method, c.req.path);
  await next();
  recordRequestComplete(requestId, c.req.method, c.req.path, c.res.status, Date.now() - startedAt);
});

/**
 * GET /v1/health — health check
 */
app.get('/v1/health', (c) => {
  return c.json({ status: 'ok', product: 'MERIDIAN', version: MERIDIAN_VERSION });
});

/**
 * GET /v1/version — version info
 */
app.get('/v1/version', (c) => {
  return c.json({ product: 'MERIDIAN', version: MERIDIAN_VERSION });
});

/**
 * GET /v1/openapi.json — OpenAPI specification
 */
app.get('/v1/openapi.json', (c) => {
  return c.json(openApiDocument);
});

/**
 * GET /v1/docs — Swagger UI
 */
app.get('/v1/docs', (c) => {
  return c.html(openApiDocsHtml);
});

/**
 * GET /v1/metrics — lightweight in-memory observability snapshot
 */
app.get('/v1/metrics', (c) => {
  return c.json(getObservabilitySnapshot());
});

/**
 * POST /v1/analyze — full TRACE + FIELD + GRAVITY + BRIEF analysis
 */
app.post('/v1/analyze', validatedJsonBody('analyzeBody', parseAnalyzeRequest), async (c) => {
  const body = c.get('analyzeBody')!;
  const requestId = c.get('requestId');

  const cached = await getCachedLayerResult<Omit<AnalyzeResponse, 'brief'>>(
    'analyze',
    body.network,
    body.tx,
    undefined,
    analyzeCacheSuffix(body.ecosystem, body.options),
  );

  let analysis: Omit<AnalyzeResponse, 'brief'> | MeridianError;
  let cacheHit = false;

  if (cached) {
    analysis = cached;
    cacheHit = true;
  } else {
    analysis = await analyze(body);
    if (!isMeridianError(analysis)) {
      await setCachedLayerResult(
        'analyze',
        body.network,
        body.tx,
        analysis.meta.ledger_sequence,
        analysis,
        { verdict: analysis.verdict, suffix: analyzeCacheSuffix(body.ecosystem, body.options) },
      );
    }
  }

  if (isMeridianError(analysis)) {
    recordEndpointError(requestId, '/v1/analyze', analysis, 502);
    return c.json(analysis, 502);
  }

  const briefStartedAt = Date.now();
  const briefResult = await synthesizeBrief(briefInputFromAnalysis(analysis));
  const briefMs = Date.now() - briefStartedAt;

  let briefFallbackUsed = false;
  let brief = '';
  let warnings = analysis.warnings;

  if (isMeridianError(briefResult)) {
    briefFallbackUsed = true;
    const fallbackBrief = await synthesizeBrief(briefInputFromAnalysis(analysis), { apiKey: undefined });

    brief =
      typeof fallbackBrief === 'string'
        ? fallbackBrief
        : 'Analysis complete. Review structured layer outputs.';
    warnings = [...(analysis.warnings ?? []), briefResult.error];
  } else {
    brief = briefResult;
  }

  const response = {
    ...analysis,
    brief,
    warnings,
    meta: {
      ...analysis.meta,
      cache_hit: cacheHit,
      layer_timings_ms: {
        ...analysis.meta.layer_timings_ms,
        brief: briefMs,
      },
    },
  };

  recordAnalyzeObservability({
    requestId,
    route: '/v1/analyze',
    analysis: response,
    briefMs,
    briefFallbackUsed,
  });

  // Best-effort treasury / signer approval routing
  void Promise.all(
    eventsForAnalysis(response).map(({ event, data }) => dispatchWebhookEvent(event, data)),
  ).catch(() => undefined);

  return c.json(response);
});

/**
 * POST /v1/screen — exchange / custodian / treasury / wallet screening profile
 */
app.post('/v1/screen', validatedJsonBody('screenBody', parseScreenRequest), async (c) => {
  const body = c.get('screenBody')!;
  const requestId = c.get('requestId');

  const screenedRequest = mergeScreeningOptions(body.profile, body, body.allowlist);
  const appliedRules = screenedRequest.options?.policy_rules ?? buildScreeningPolicyRules(body.profile);

  const analysis = await analyze(screenedRequest);
  if (isMeridianError(analysis)) {
    recordEndpointError(requestId, '/v1/screen', analysis, 502);
    void dispatchWebhookEvent('analysis.failed', {
      profile: body.profile,
      error: analysis.error,
      code: analysis.code,
      network: body.network,
    });
    return c.json(analysis, 502);
  }

  const briefResult = await synthesizeBrief(briefInputFromAnalysis(analysis));
  const brief = isMeridianError(briefResult)
    ? 'Screening complete. Review disposition and structured outputs.'
    : briefResult;

  const full = { ...analysis, brief };
  const result = toScreeningResult(full, body.profile, appliedRules);

  if (result.disposition !== 'allow') {
    void dispatchWebhookEvent('approval.required', {
      profile: body.profile,
      disposition: result.disposition,
      decision: result.decision,
      verdict: result.verdict,
      blast_radius: result.blast_radius,
      network: body.network,
    });
  }
  void dispatchWebhookEvent('analysis.completed', {
    profile: body.profile,
    disposition: result.disposition,
    decision: result.decision,
    verdict: result.verdict,
    blast_radius: result.blast_radius,
    network: body.network,
  });

  return c.json(result);
});

/**
 * GET /v1/webhooks — list treasury/signer webhook subscriptions
 */
app.get('/v1/webhooks', (c) => {
  return c.json({ webhooks: listWebhooks() });
});

/**
 * POST /v1/webhooks — register a webhook destination for approval routing
 */
app.post('/v1/webhooks', validatedJsonBody('webhookBody', parseWebhookRegisterRequest), async (c) => {
  try {
    const body = c.get('webhookBody')!;
    const created = registerWebhook(body);
    return c.json(created, 201);
  } catch (err) {
    return c.json(
      invalidRequest(
        err instanceof Error ? err.message : 'Invalid webhook',
        'Provide an absolute HTTP(S) url and optional events/secret/label.',
      ),
      400,
    );
  }
});

/**
 * DELETE /v1/webhooks/:id — remove a webhook subscription
 */
app.delete('/v1/webhooks/:id', (c) => {
  const id = c.req.param('id');
  const removed = deleteWebhook(id);
  if (!removed) {
    return c.json(invalidRequest('Webhook not found', 'Check the webhook id and try again.'), 404);
  }
  return c.json({ deleted: true, id });
});

/**
 * POST /v1/analyze/batch — batch TRACE + FIELD + GRAVITY analysis
 */
app.post('/v1/analyze/batch', validatedJsonBody('batchAnalyzeBody', parseBatchAnalyzeRequest), async (c) => {
  const body = c.get('batchAnalyzeBody')!;
  const requestId = c.get('requestId');

  const requests: BatchAnalyzeItemRequest[] = body.items.map((item) => ({
    id: item.id,
    tx: item.tx,
    network: item.network ?? body.default_network!,
    ecosystem: item.ecosystem ?? body.ecosystem,
    options: {
      ...body.options,
      ...item.options,
    },
  }));

  const result = await analyzeBatch(requests);
  recordBatchObservability({ requestId, route: '/v1/analyze/batch', result });
  return c.json(result);
});

/**
 * POST /v1/analyze/diff — compare two transactions (A vs B) for safest rewrite workflows
 */
app.post('/v1/analyze/diff', validatedJsonBody('analyzeDiffBody', parseAnalyzeDiffRequest), async (c) => {
  const body = c.get('analyzeDiffBody')!;
  const requestId = c.get('requestId');

  const result = await analyzeDiff(body as AnalyzeDiffRequest);
  if (isMeridianError(result)) {
    recordEndpointError(requestId, '/v1/analyze/diff', result, 502);
    return c.json(result, 502);
  }

  return c.json(result);
});

/**
 * POST /v1/trace — TRACE only, fast path
 */
app.post('/v1/trace', validatedJsonBody('traceBody', parseTraceRequest), async (c) => {
  const body = c.get('traceBody')!;
  const requestId = c.get('requestId');

  const result = await cachedTrace(body.tx, body.network);
  if (isMeridianError(result)) {
    recordEndpointError(requestId, '/v1/trace', result, 502);
    return c.json(result, 502);
  }
  return c.json(result);
});

/**
 * POST /v1/field — FIELD only, dependency mapping
 */
app.post('/v1/field', validatedJsonBody('fieldBody', parseFieldRequest), async (c) => {
  const body = c.get('fieldBody')!;
  const requestId = c.get('requestId');

  const fieldResult = await cachedField(body.tx, body.network, body.ecosystem);
  if (isMeridianError(fieldResult)) {
    recordEndpointError(requestId, '/v1/field', fieldResult, 502);
    return c.json(fieldResult, 502);
  }

  return c.json(fieldResult);
});

/**
 * POST /v1/gravity — GRAVITY only, blast radius
 */
app.post('/v1/gravity', validatedJsonBody('gravityBody', parseGravityRequest), async (c) => {
  const body = c.get('gravityBody')!;
  const requestId = c.get('requestId');

  const gravityResult = await cachedGravity(body.tx, body.network, body.ecosystem);
  if (isMeridianError(gravityResult)) {
    recordEndpointError(requestId, '/v1/gravity', gravityResult, 502);
    return c.json(gravityResult, 502);
  }

  return c.json(gravityResult);
});

export { app };
