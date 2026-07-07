import { createMiddleware } from 'hono/factory';

const PUBLIC_PATHS = new Set([
  '/v1/health',
  '/v1/version',
  '/v1/openapi.json',
  '/v1/docs',
]);

function extractApiKey(authorization: string | undefined, apiKeyHeader: string | undefined): string | undefined {
  if (apiKeyHeader) return apiKeyHeader;
  if (!authorization) return undefined;
  const [scheme, token] = authorization.split(' ');
  if (scheme?.toLowerCase() === 'bearer' && token) return token;
  return undefined;
}

/**
 * Require MERIDIAN_API_KEY when configured. Public paths are exempt.
 */
export const authMiddleware = createMiddleware(async (c, next) => {
  const configuredKey = process.env.MERIDIAN_API_KEY;
  if (!configuredKey || PUBLIC_PATHS.has(c.req.path)) {
    await next();
    return;
  }

  const providedKey = extractApiKey(
    c.req.header('Authorization'),
    c.req.header('X-Api-Key'),
  );

  if (providedKey !== configuredKey) {
    return c.json(
      {
        error: 'Unauthorized',
        code: 'UNAUTHORIZED',
        hint: 'Provide a valid API key via Authorization: Bearer <key> or X-Api-Key header.',
        layer: 'API',
      },
      401,
    );
  }

  await next();
});
