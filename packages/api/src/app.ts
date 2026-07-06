import { Hono } from 'hono';
import {
  analyze,
  analyzeBatch,
  MERIDIAN_VERSION,
  trace,
  buildFieldGraph,
  scoreGravity,
} from '@meridian/core';
import { synthesizeBrief } from '@meridian/ai';
import type { AnalyzeRequest, BatchAnalyzeItemRequest, MeridianError, Network } from '@meridian/core';

type Env = {
  Variables: {
    requestId: string;
  };
};

interface BatchAnalyzeRequestBody {
  items: Array<{
    id?: string;
    tx: string;
    network?: Network;
    ecosystem?: AnalyzeRequest['ecosystem'];
    options?: AnalyzeRequest['options'];
  }>;
  default_network?: Network;
  ecosystem?: AnalyzeRequest['ecosystem'];
  options?: AnalyzeRequest['options'];
}

const app = new Hono<Env>();

/**
 * Check if a value is a MeridianError.
 *
 * @param value - Value to check
 * @returns True if MeridianError
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

function invalidRequest(message: string, hint: string) {
  return {
    error: message,
    code: 'INVALID_REQUEST',
    hint,
    layer: 'TRACE',
  } satisfies MeridianError;
}

app.use('*', async (c, next) => {
  c.set('requestId', crypto.randomUUID());
  await next();
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
 * POST /v1/analyze — full TRACE + FIELD + GRAVITY + BRIEF analysis
 */
app.post('/v1/analyze', async (c) => {
  let body: AnalyzeRequest;
  try {
    body = await c.req.json<AnalyzeRequest>();
  } catch {
    return c.json(
      invalidRequest('Invalid JSON request body', 'Send a JSON body with tx (base64 XDR) and network fields'),
      400,
    );
  }

  if (!body.tx || !body.network) {
    return c.json(
      invalidRequest(
        'Missing required fields: tx and network',
        'Provide tx (base64 XDR string) and network (mainnet | testnet)',
      ),
      400,
    );
  }

  const analysis = await analyze(body);

  if (isMeridianError(analysis)) {
    return c.json(analysis, 502);
  }

  const brief = await synthesizeBrief({
    verdict: analysis.verdict,
    confidence: analysis.confidence,
    trace: analysis.trace,
    field: analysis.field,
    gravity: analysis.gravity,
    fix_sequence: analysis.fix_sequence,
    warnings: analysis.warnings,
  });

  if (isMeridianError(brief)) {
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

    return c.json({
      ...analysis,
      brief:
        typeof fallbackBrief === 'string'
          ? fallbackBrief
          : 'Analysis complete. Review structured layer outputs.',
      warnings: [...(analysis.warnings ?? []), brief.error],
    });
  }

  return c.json({ ...analysis, brief });
});

/**
 * POST /v1/analyze/batch — batch TRACE + FIELD + GRAVITY analysis
 */
app.post('/v1/analyze/batch', async (c) => {
  let body: BatchAnalyzeRequestBody;
  try {
    body = await c.req.json<BatchAnalyzeRequestBody>();
  } catch {
    return c.json(
      invalidRequest('Invalid JSON request body', 'Send a JSON body with a non-empty items array.'),
      400,
    );
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return c.json(
      invalidRequest('Missing required field: items', 'Provide a non-empty items array.'),
      400,
    );
  }

  const requests: BatchAnalyzeItemRequest[] = [];
  for (const [index, item] of body.items.entries()) {
    const network = item.network ?? body.default_network;
    if (!item.tx || !network) {
      return c.json(
        invalidRequest(
          `Invalid batch item at index ${index}`,
          'Each item must include tx and either item.network or default_network.',
        ),
        400,
      );
    }

    requests.push({
      id: item.id,
      tx: item.tx,
      network,
      ecosystem: item.ecosystem ?? body.ecosystem,
      options: {
        ...body.options,
        ...item.options,
      },
    });
  }

  const result = await analyzeBatch(requests);
  return c.json(result);
});

/**
 * POST /v1/trace — TRACE only, fast path
 */
app.post('/v1/trace', async (c) => {
  const body = await c.req.json<{ tx: string; network: 'mainnet' | 'testnet' }>();
  if (!body.tx || !body.network) {
    return c.json(invalidRequest('Missing required fields: tx and network', 'Provide tx and network'), 400);
  }

  const result = await trace(body.tx, { network: body.network });
  if (isMeridianError(result)) return c.json(result, 502);
  return c.json(result);
});

/**
 * POST /v1/field — FIELD only, dependency mapping
 */
app.post('/v1/field', async (c) => {
  const body = await c.req.json<{
    tx: string;
    network: 'mainnet' | 'testnet';
    ecosystem?: AnalyzeRequest['ecosystem'];
  }>();

  const traceResult = await trace(body.tx, { network: body.network });
  if (isMeridianError(traceResult)) return c.json(traceResult, 502);

  const fieldResult = buildFieldGraph(traceResult, traceResult.simulation_context, {
    network: body.network,
    manifest: body.ecosystem,
  });

  return c.json(fieldResult);
});

/**
 * POST /v1/gravity — GRAVITY only, blast radius
 */
app.post('/v1/gravity', async (c) => {
  const body = await c.req.json<{
    tx: string;
    network: 'mainnet' | 'testnet';
    ecosystem?: AnalyzeRequest['ecosystem'];
  }>();

  const traceResult = await trace(body.tx, { network: body.network });
  if (isMeridianError(traceResult)) return c.json(traceResult, 502);

  const fieldResult = buildFieldGraph(traceResult, traceResult.simulation_context, {
    network: body.network,
    manifest: body.ecosystem,
  });

  const gravityResult = scoreGravity(traceResult, fieldResult, { manifest: body.ecosystem });
  return c.json(gravityResult);
});

export { app };
