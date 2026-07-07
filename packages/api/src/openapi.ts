import { MERIDIAN_VERSION } from '@meridian/core';

export const openApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'MERIDIAN API',
    version: MERIDIAN_VERSION,
    description:
      'Pre-execution intelligence for Stellar developers. TRACE, FIELD, GRAVITY, and BRIEF analysis over HTTP.',
  },
  servers: [{ url: '/', description: 'Current host' }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
      },
      apiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'X-Api-Key',
      },
    },
    schemas: {
      ErrorResponse: {
        type: 'object',
        properties: {
          error: { type: 'string' },
          code: { type: 'string' },
          hint: { type: 'string' },
          layer: { type: 'string' },
          details: { type: 'array', items: { type: 'string' } },
        },
        required: ['error', 'code', 'hint', 'layer'],
      },
      AnalyzeRequest: {
        type: 'object',
        required: ['tx', 'network'],
        properties: {
          tx: { type: 'string', description: 'Base64-encoded transaction XDR' },
          network: { type: 'string', enum: ['mainnet', 'testnet'] },
          ecosystem: { type: 'object' },
          options: { type: 'object' },
        },
      },
      TraceRequest: {
        type: 'object',
        required: ['tx', 'network'],
        properties: {
          tx: { type: 'string' },
          network: { type: 'string', enum: ['mainnet', 'testnet'] },
        },
      },
    },
  },
  security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
  paths: {
    '/v1/health': {
      get: {
        summary: 'Health check',
        security: [],
        responses: {
          '200': { description: 'Service is healthy' },
        },
      },
    },
    '/v1/version': {
      get: {
        summary: 'Product version',
        security: [],
        responses: {
          '200': { description: 'Version metadata' },
        },
      },
    },
    '/v1/metrics': {
      get: {
        summary: 'In-memory observability snapshot',
        responses: {
          '200': { description: 'Request counters and confidence distribution' },
        },
      },
    },
    '/v1/analyze': {
      post: {
        summary: 'Full TRACE + FIELD + GRAVITY + BRIEF analysis',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AnalyzeRequest' },
            },
          },
        },
        responses: {
          '200': { description: 'Analysis result with brief' },
          '400': { description: 'Invalid request', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '401': { description: 'Unauthorized' },
          '413': { description: 'Payload too large' },
          '429': { description: 'Rate limited' },
          '502': { description: 'Analysis layer error' },
        },
      },
    },
    '/v1/analyze/batch': {
      post: {
        summary: 'Batch TRACE + FIELD + GRAVITY analysis',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['items'],
                properties: {
                  default_network: { type: 'string', enum: ['mainnet', 'testnet'] },
                  items: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['tx'],
                      properties: {
                        id: { type: 'string' },
                        tx: { type: 'string' },
                        network: { type: 'string', enum: ['mainnet', 'testnet'] },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Batch summary and per-item results' },
          '400': { description: 'Invalid request' },
        },
      },
    },
    '/v1/trace': {
      post: {
        summary: 'TRACE only',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/TraceRequest' },
            },
          },
        },
        responses: {
          '200': { description: 'TRACE result' },
          '400': { description: 'Invalid request' },
          '502': { description: 'TRACE error' },
        },
      },
    },
    '/v1/field': {
      post: {
        summary: 'TRACE + FIELD dependency mapping',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/TraceRequest' },
            },
          },
        },
        responses: {
          '200': { description: 'FIELD result' },
          '400': { description: 'Invalid request' },
          '502': { description: 'TRACE error' },
        },
      },
    },
    '/v1/gravity': {
      post: {
        summary: 'TRACE + FIELD + GRAVITY blast radius',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/TraceRequest' },
            },
          },
        },
        responses: {
          '200': { description: 'GRAVITY result' },
          '400': { description: 'Invalid request' },
          '502': { description: 'TRACE error' },
        },
      },
    },
  },
} as const;

export const openApiDocsHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>MERIDIAN API Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.ui = SwaggerUIBundle({
      url: '/v1/openapi.json',
      dom_id: '#swagger-ui',
    });
  </script>
</body>
</html>`;
