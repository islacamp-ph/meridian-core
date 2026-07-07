import { createMiddleware } from 'hono/factory';

const DEFAULT_MAX_BODY_BYTES = 1_048_576;

function parseMaxBodyBytes(): number {
  const raw = process.env.MERIDIAN_MAX_BODY_BYTES;
  if (!raw) return DEFAULT_MAX_BODY_BYTES;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_BODY_BYTES;
}

/**
 * Reject requests whose Content-Length exceeds the configured limit.
 */
export const bodyLimitMiddleware = createMiddleware(async (c, next) => {
  if (c.req.method === 'GET' || c.req.method === 'HEAD' || c.req.method === 'OPTIONS') {
    await next();
    return;
  }

  const contentLength = c.req.header('Content-Length');
  if (contentLength) {
    const bytes = Number.parseInt(contentLength, 10);
    if (Number.isFinite(bytes) && bytes > parseMaxBodyBytes()) {
      return c.json(
        {
          error: 'Request body too large',
          code: 'PAYLOAD_TOO_LARGE',
          hint: `Maximum request body size is ${parseMaxBodyBytes()} bytes.`,
          layer: 'API',
        },
        413,
      );
    }
  }

  await next();
});
