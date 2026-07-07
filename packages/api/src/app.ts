import { createMiddleware } from 'hono/factory';
import { Hono } from 'hono';
import {
  analyze,
  analyzeBatch,
  buildFieldGraph,
  MERIDIAN_VERSION,
  scoreGravity,
  trace,
} from '@meridian/core';
import { synthesizeBrief } from '@meridian/ai';
import type { AnalyzeRequest, BatchAnalyzeItemRequest, MeridianError } from '@meridian/core';
import {
  getObservabilitySnapshot,
  recordAnalyzeObservability,
  recordBatchObservability,
  recordEndpointError,
  recordRequestComplete,
  recordRequestStart,
} from './observability.js';
import {
  parseAnalyzeRequest,
  parseBatchAnalyzeRequest,
  parseFieldRequest,
  parseGravityRequest,
  parseTraceRequest,
  type BatchAnalyzeRequestBody,
  type FieldRequestBody,
  type GravityRequestBody,
  type TraceRequestBody,
  type ValidationResult,
} from './validation.js';

type Env = {
  Variables: {
    requestId: string;
    requestStartedAt: number;
    analyzeBody?: AnalyzeRequest;
    batchAnalyzeBody?: BatchAnalyzeRequestBody;
    traceBody?: TraceRequestBody;
    fieldBody?: FieldRequestBody;
    gravityBody?: GravityRequestBody;
  };
};

const app = new Hono<Env>();

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

  const analysis = await analyze(body);
  if (isMeridianError(analysis)) {
    recordEndpointError(requestId, '/v1/analyze', analysis, 502);
    return c.json(analysis, 502);
  }

  const briefStartedAt = Date.now();
  const briefResult = await synthesizeBrief({
    verdict: analysis.verdict,
    confidence: analysis.confidence,
    trace: analysis.trace,
    field: analysis.field,
    gravity: analysis.gravity,
    fix_sequence: analysis.fix_sequence,
    warnings: analysis.warnings,
  });
  const briefMs = Date.now() - briefStartedAt;

  let briefFallbackUsed = false;
  let brief = '';
  let warnings = analysis.warnings;

  if (isMeridianError(briefResult)) {
    briefFallbackUsed = true;
    const fallbackBrief = await synthesizeBrief(
      {
        verdict: analysis.verdict,
        confidence: analysis.confidence,
        trace: analysis.trace,
        field: analysis.field,
        gravity: analysis.gravity,
        fix_sequence: analysis.fix_sequence,
        warnings: analysis.warnings,
      },
      { apiKey: undefined },
    );

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

  return c.json(response);
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
 * POST /v1/trace — TRACE only, fast path
 */
app.post('/v1/trace', validatedJsonBody('traceBody', parseTraceRequest), async (c) => {
  const body = c.get('traceBody')!;
  const requestId = c.get('requestId');

  const result = await trace(body.tx, { network: body.network });
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

  const traceResult = await trace(body.tx, { network: body.network });
  if (isMeridianError(traceResult)) {
    recordEndpointError(requestId, '/v1/field', traceResult, 502);
    return c.json(traceResult, 502);
  }

  const fieldResult = await buildFieldGraph(traceResult, traceResult.simulation_context, {
    network: body.network,
    manifest: body.ecosystem,
    txXdr: body.tx,
  });

  return c.json(fieldResult);
});

/**
 * POST /v1/gravity — GRAVITY only, blast radius
 */
app.post('/v1/gravity', validatedJsonBody('gravityBody', parseGravityRequest), async (c) => {
  const body = c.get('gravityBody')!;
  const requestId = c.get('requestId');

  const traceResult = await trace(body.tx, { network: body.network });
  if (isMeridianError(traceResult)) {
    recordEndpointError(requestId, '/v1/gravity', traceResult, 502);
    return c.json(traceResult, 502);
  }

  const fieldResult = await buildFieldGraph(traceResult, traceResult.simulation_context, {
    network: body.network,
    manifest: body.ecosystem,
    txXdr: body.tx,
  });

  const gravityResult = scoreGravity(traceResult, fieldResult, { manifest: body.ecosystem });
  return c.json(gravityResult);
});

export { app };
