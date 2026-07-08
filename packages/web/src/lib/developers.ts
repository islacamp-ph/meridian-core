export const pipelineLayers = [
  {
    name: 'TRACE',
    description: 'Simulates the transaction against Soroban RPC and parses the execution path.',
  },
  {
    name: 'FIELD',
    description: 'Maps contract dependencies, checks TTL/archival risk, enriches WASM hashes.',
  },
  {
    name: 'GRAVITY',
    description: 'Scores blast radius with evidence-based factors and recovery assessment.',
  },
  {
    name: 'BRIEF',
    description: 'Synthesizes a grounded, plain-language risk briefing via Claude.',
  },
] as const;

export const developerTools = [
  {
    id: 'cli',
    name: 'CLI',
    package: 'meridian-core',
    install: 'npm install -g meridian-core',
    description: 'Full pipeline from your terminal — analyze, trace, field, gravity, and manifest tooling.',
    example: 'meridian analyze <xdr> --network testnet',
    docsPath: '/guides/cli/',
  },
  {
    id: 'js',
    name: 'JavaScript SDK',
    package: '@meridian/stellar',
    install: 'npm install @meridian/stellar',
    description: 'HTTP client for the REST API plus local engine re-exports for offline analysis.',
    example: `import { MeridianClient } from '@meridian/stellar';

const client = new MeridianClient({ baseUrl: 'http://localhost:3000' });
const result = await client.analyze({ tx: '<xdr>', network: 'testnet' });`,
    docsPath: '/guides/sdks/',
  },
  {
    id: 'py',
    name: 'Python SDK',
    package: 'meridian-py',
    install: 'pip install meridian-py',
    description: 'Python HTTP client for hosted MERIDIAN API deployments.',
    example: `from meridian import MeridianClient

client = MeridianClient("http://localhost:3000")
result = client.analyze({"tx": "<xdr>", "network": "testnet"})`,
    docsPath: '/guides/sdks/',
  },
  {
    id: 'api',
    name: 'REST API',
    package: '@meridian/api',
    install: 'npm run dev --workspace=@meridian/api',
    description: 'Hono server with OpenAPI docs, batch analysis, Redis cache, and rate limiting.',
    example: `curl -X POST http://localhost:3000/v1/analyze \\
  -H "Content-Type: application/json" \\
  -d '{"tx": "<xdr>", "network": "testnet"}'`,
    docsPath: '/guides/api/',
  },
  {
    id: 'action',
    name: 'GitHub Action',
    package: 'meridian-action',
    install: 'uses: ./packages/meridian-action',
    description: 'Block merges on ABORT or WARN verdicts in CI — CLI or hosted API.',
    example: `- uses: ./packages/meridian-action
  with:
    tx-file: tx.xdr
    network: testnet
    fail-on: ABORT`,
    docsPath: '/guides/github-action/',
  },
] as const;
