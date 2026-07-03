# MERIDIAN

**Pre-execution intelligence for Stellar developers. Know what crosses before it does.**

MERIDIAN sits between a developer's code and the Stellar network. Before any transaction submits, it simulates end-to-end, maps every contract it touches downstream, scores what breaks if something goes wrong, and returns a plain-language GenAI risk brief — all in one API call.

## Verdict States

| Verdict | Meaning |
|---------|---------|
| `CLEAR` | Safe to submit |
| `WARN`  | Submit with caution, review warnings |
| `ABORT` | Do not submit, critical failure predicted |

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment config
cp .env.example .env

# Build all packages
npm run build

# Run tests
npm test

# Start API server (port 3000)
npm run dev --workspace=@meridian/api

# Or use the CLI directly
npm run build --workspace=@meridian/cli
node packages/cli/dist/index.js analyze <base64-xdr> --network testnet
```

## API

```bash
# Health check
curl http://localhost:3000/v1/health

# Full analysis
curl -X POST http://localhost:3000/v1/analyze \
  -H "Content-Type: application/json" \
  -d '{"tx": "<base64-xdr>", "network": "testnet"}'
```

## CLI

`@meridian/cli` exposes the same TRACE + FIELD + GRAVITY + BRIEF pipeline as a `meridian` binary.

```bash
# Full analysis (default command)
meridian analyze <base64-xdr> --network testnet

# Pipe XDR from a file or stdin
meridian analyze --file tx.xdr --network mainnet
cat tx.xdr | meridian analyze --network testnet --json

# Run individual layers
meridian trace <base64-xdr> --network testnet
meridian field <base64-xdr> --ecosystem manifest.json
meridian gravity <base64-xdr> --ecosystem manifest.json

# Version
meridian version
```

Options include `--network`, `--rpc-url` (override RPC endpoint without env vars), `--ecosystem <manifest.json>`, `--skip-field`, `--skip-gravity`, `--confidence-threshold`, `--no-brief`, `--api-key`, and `--json` for machine-readable output. Run `meridian --help` or `meridian <command> --help` for full details.

To install the `meridian` command globally from this monorepo:

```bash
npm run build --workspace=@meridian/cli
npm link --workspace=@meridian/cli
```

## Monorepo Structure

```
packages/
├── core/    TRACE + FIELD + GRAVITY engines
├── ai/      BRIEF GenAI synthesis (Claude)
├── api/     REST API server (Hono)
└── cli/     `meridian` command-line interface
```

## Environment Variables

See `.env.example` for required configuration.

## Build Status

**Phase 1 — Vertical Slice** (current)
- [x] `packages/core/trace` — simulateTransaction wrapper + XDR parser
- [x] `packages/ai/brief` — Claude API synthesis with fallback
- [x] `packages/api/` — POST /v1/analyze returning full response shape
- [x] `packages/cli/` — `meridian` command-line interface (analyze, trace, field, gravity, version)
- [ ] End-to-end validation with ScholarSeal canonical test case

## License

MIT
