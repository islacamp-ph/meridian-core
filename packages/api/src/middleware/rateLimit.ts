import { createMiddleware } from 'hono/factory';

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, RateLimitBucket>();

const DEFAULT_LIMIT_PER_MINUTE = 100;
const WINDOW_MS = 60_000;

function parseRateLimit(): number {
  const raw = process.env.MERIDIAN_RATE_LIMIT_PER_MINUTE;
  if (!raw) return DEFAULT_LIMIT_PER_MINUTE;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_LIMIT_PER_MINUTE;
}

function clientKey(c: { req: { header: (name: string) => string | undefined } }): string {
  return (
    c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ??
    c.req.header('X-Real-Ip') ??
    'anonymous'
  );
}

/**
 * Simple in-memory sliding-window rate limiter per client IP.
 */
export const rateLimitMiddleware = createMiddleware(async (c, next) => {
  const limit = parseRateLimit();
  const key = clientKey(c);
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    await next();
    return;
  }

  if (bucket.count >= limit) {
    const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
    c.header('Retry-After', String(retryAfter));
    return c.json(
      {
        error: 'Rate limit exceeded',
        code: 'RATE_LIMITED',
        hint: `Maximum ${limit} requests per minute. Retry after ${retryAfter}s.`,
        layer: 'API',
      },
      429,
    );
  }

  bucket.count += 1;
  await next();
});

/**
 * Reset rate-limit state (for tests).
 */
export function resetRateLimitState(): void {
  buckets.clear();
}
