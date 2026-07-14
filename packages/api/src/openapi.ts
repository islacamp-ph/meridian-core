import { MERIDIAN_VERSION } from '@meridian/core';

export const openApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'MERIDIAN API',
    version: MERIDIAN_VERSION,
    description:
      'Pre-execution intelligence for Stellar developers. TRACE, FIELD, GRAVITY, BRIEF, policy gates, and A/B diff over HTTP.',
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
      PolicyRule: {
        type: 'object',
        required: ['type'],
        properties: {
          type: {
            type: 'string',
            enum: [
              'unknown_contract',
              'admin_auth_path',
              'max_blast_radius',
              'allowlist_only',
              'ttl_critical',
              'upgrade_risk',
              'min_confidence',
            ],
          },
          effect: { type: 'string', enum: ['ABORT', 'WARN', 'ALLOW'] },
          threshold: { type: 'number', description: 'For max_blast_radius' },
          allowlist: {
            type: 'array',
            items: { type: 'string' },
            description: 'For allowlist_only',
          },
          min_confidence: { type: 'number', minimum: 0, maximum: 1 },
          label: { type: 'string' },
        },
      },
      AnalyzeOptions: {
        type: 'object',
        properties: {
          skip_field: { type: 'boolean' },
          skip_gravity: { type: 'boolean' },
          confidence_threshold: { type: 'number', minimum: 0, maximum: 1 },
          rpc_url: { type: 'string' },
          auth_mode: { type: 'string', enum: ['enforce', 'record', 'record_allow_nonroot'] },
          field_auth_mode: { type: 'string', enum: ['enforce', 'record', 'record_allow_nonroot'] },
          deep_discovery: { type: 'boolean' },
          policy_rules: {
            type: 'array',
            items: { $ref: '#/components/schemas/PolicyRule' },
            description: 'Deterministic pre-merge policy gates evaluated after analysis',
          },
        },
      },
      ManifestContract: {
        type: 'object',
        required: ['name', 'address', 'network'],
        properties: {
          name: { type: 'string' },
          address: { type: 'string' },
          network: { type: 'string', enum: ['mainnet', 'testnet'] },
          dependencies: { type: 'array', items: { type: 'string' } },
          active_users: { type: 'number' },
          criticality: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW'] },
          role: { type: 'string' },
          expected_wasm_hash: {
            type: 'string',
            description: '64-char hex SHA-256 of expected Wasm; enables upgrade/admin drift detection',
          },
        },
      },
      EcosystemManifest: {
        type: 'object',
        required: ['name', 'version', 'contracts'],
        properties: {
          name: { type: 'string' },
          version: { type: 'string' },
          contracts: {
            type: 'array',
            items: { $ref: '#/components/schemas/ManifestContract' },
          },
        },
      },
      AnalyzeRequest: {
        type: 'object',
        required: ['tx', 'network'],
        properties: {
          tx: { type: 'string', description: 'Base64-encoded transaction XDR' },
          network: { type: 'string', enum: ['mainnet', 'testnet'] },
          ecosystem: { $ref: '#/components/schemas/EcosystemManifest' },
          options: { $ref: '#/components/schemas/AnalyzeOptions' },
        },
      },
      AnalyzeDiffRequest: {
        type: 'object',
        required: ['tx_a', 'tx_b', 'network'],
        properties: {
          tx_a: { type: 'string', description: 'Base64-encoded transaction XDR (baseline / original)' },
          tx_b: { type: 'string', description: 'Base64-encoded transaction XDR (candidate rewrite)' },
          network: { type: 'string', enum: ['mainnet', 'testnet'] },
          ecosystem: { $ref: '#/components/schemas/EcosystemManifest' },
          options: { $ref: '#/components/schemas/AnalyzeOptions' },
        },
      },
      Decision: {
        type: 'object',
        required: ['action', 'reason', 'confidence', 'top_risks'],
        properties: {
          action: { type: 'string', enum: ['submit', 'hold', 'rewrite'] },
          reason: { type: 'string' },
          confidence: { type: 'number' },
          top_risks: { type: 'array', items: { type: 'object' } },
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
        description:
          'Returns verdict, decision (submit | hold | rewrite), top_risks, optional policy result, and brief.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AnalyzeRequest' },
            },
          },
        },
        responses: {
          '200': {
            description:
              'Analysis result with decision, top_risks, optional policy, and brief',
          },
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
                  ecosystem: { $ref: '#/components/schemas/EcosystemManifest' },
                  options: { $ref: '#/components/schemas/AnalyzeOptions' },
                  items: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['tx'],
                      properties: {
                        id: { type: 'string' },
                        tx: { type: 'string' },
                        network: { type: 'string', enum: ['mainnet', 'testnet'] },
                        ecosystem: { $ref: '#/components/schemas/EcosystemManifest' },
                        options: { $ref: '#/components/schemas/AnalyzeOptions' },
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
    '/v1/analyze/diff': {
      post: {
        summary: 'Compare two transactions (A vs B)',
        description:
          'Runs full analysis on tx_a and tx_b, then returns an execution/risk diff for safest-rewrite workflows.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AnalyzeDiffRequest' },
            },
          },
        },
        responses: {
          '200': { description: 'Diff of verdict, decision, contracts, auth, writes, and risks' },
          '400': { description: 'Invalid request', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '401': { description: 'Unauthorized' },
          '502': { description: 'Analysis layer error' },
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
