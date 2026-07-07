# MERIDIAN

**Pre-execution intelligence for Stellar developers. Know what crosses before it does.**

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](#license)
[![Node](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white)](#requirements)
[![npm](https://img.shields.io/npm/v/meridian-core?label=meridian-core)](https://www.npmjs.com/package/meridian-core)

MERIDIAN sits between a developer's code and the Stellar network. Before any transaction submits, it simulates end-to-end, maps every contract it touches downstream, scores what breaks if something goes wrong, and returns a plain-language GenAI risk brief — all in one API call or CLI command.

---

## Table of Contents

- [How It Works](#how-it-works)
- [Verdict States](#verdict-states)
- [Requirements](#requirements)
- [Installation](#installation)
- [CLI Usage](#cli-usage)
  - [Commands](#commands)
  - [Options](#options)
  - [Examples](#examples)
  - [Ecosystem Manifest](#ecosystem-manifest)
- [REST API](#rest-api)
- [Docker](#docker)
- [Environment Variables](#environment-variables)
- [Monorepo Structure](#monorepo-structure)
- [Development](#development)
- [Roadmap](#roadmap)
- [License](#license)

---

## How It Works

```mermaid
flowchart TD
    A[Transaction XDR] --> B[TRACE]
    B --> C[FIELD]
    C --> D[GRAVITY]
    D --> E[BRIEF]
    B -.simulateTransaction.-> B
    C -.dependency graph.-> C
    D -.blast radius.-> D
    E -.GenAI synthesis.-> E
    E --> F[Verdict: CLEAR / WARN / ABORT]
```

| Layer | Package | What it does |
|---|---|---|
| **TRACE** | `@meridian/core` | Simulates the transaction against Soroban RPC (`enforce` auth mode), parses the execution path (invoke, read, write, auth steps), auth entries, fee estimate, and resource usage including `memory_bytes` |
| **FIELD** | `@meridian/core` | Maps every contract touched — via footprint, execution path, manifest BFS, and optional `record` / `record_allow_nonroot` re-simulation — checks TTL/archival risk on footprint entries, and enriches nodes with on-chain WASM hashes |
| **GRAVITY** | `@meridian/core` | Scores the blast radius with evidence-based factors and returns a recoverability assessment (`FULL`, `PARTIAL`, or `NONE`) |
| **BRIEF** | `@meridian/ai` | Synthesizes a grounded, plain-language risk briefing via Claude (with a deterministic fallback if no API key is set) |

### Simulation auth modes

Soroban `simulateTransaction` supports three auth modes. MERIDIAN uses them as follows:

| Mode | Used by | Purpose |
|---|---|---|
| `enforce` | TRACE (default) | Production analysis — strict authorization checking |
| `record` | FIELD (default) | Dependency discovery — records auth entries without enforcing |
| `record_allow_nonroot` | FIELD (`deep_discovery: true`) | Deep ecosystem mapping — allows non-root authorization paths |

### Analysis output

Beyond the verdict, every full analysis returns:

| Field | Layer | Description |
|---|---|---|
| `trace.execution_path` | TRACE | Invoke, read, write, auth, and classic steps |
| `trace.resource_usage.memory_bytes` | TRACE | Memory allocated during simulation (from RPC `cost.memBytes`) |
| `field.dependency_graph` | FIELD | Contracts with depth, manifest metadata, `source`, and optional `wasm_hash` |
| `field.ttl_warnings` | FIELD | Entries nearing archival expiry (`WARNING`) or already expired (`CRITICAL`) |
| `gravity.recovery` | GRAVITY | `FULL` — no critical impacts; `PARTIAL` — some recoverable risk; `NONE` — archived state or catastrophic failure |
| `fix_sequence` | analyze | Numbered remediation steps returned on `WARN` and `ABORT` verdicts |
| `warnings` | analyze | Staleness, low confidence, TTL, and other advisory messages |

## Verdict States

| Verdict | Meaning |
|---|---|
| 🟢 `CLEAR` | Safe to submit |
| 🟡 `WARN`  | Submit with caution — review warnings and `fix_sequence` |
| 🔴 `ABORT` | Do not submit — critical failure predicted; follow `fix_sequence` |

## Requirements

- Node.js **>= 20**
- A Soroban RPC endpoint for the network you're targeting (testnet/mainnet)
- *(Optional)* An [Anthropic API key](https://console.anthropic.com/) for GenAI-synthesized briefs — MERIDIAN falls back to a deterministic brief without one

## Installation

### CLI (recommended for most users)

```bash
npm install -g meridian-core
meridian-core --help
```

This installs both the `meridian` and `meridian-core` binaries.

### From source (monorepo development)

```bash
git clone https://github.com/armlynobinguar/meridian-core.git
cd meridian-core

# Install dependencies for every package
npm install

# Copy environment config
cp .env.example .env

# Build all packages
npm run build

# Run the full test suite
npm test
```

## CLI Usage

`meridian-core` runs the full TRACE → FIELD → GRAVITY → BRIEF pipeline — or any individual layer — directly from your terminal.

### Commands

| Command | Description |
|---|---|
| `meridian analyze [tx]` | Full pipeline: TRACE + FIELD + GRAVITY + BRIEF *(default command)* |
| `meridian trace [tx]` | TRACE only — simulate and report the execution path |
| `meridian field [tx]` | TRACE + FIELD — map the dependency graph touched by the transaction |
| `meridian gravity [tx]` | TRACE + FIELD + GRAVITY — score the blast radius |
| `meridian version` | Print CLI and engine version |
| `meridian --help` / `meridian <command> --help` | Show detailed help |

`tx` is the base64-encoded transaction XDR. It can be passed as an argument, via `--file`, or piped over stdin — see [Examples](#examples).

### Options

| Flag | Applies to | Description |
|---|---|---|
| `-n, --network <network>` | all | `mainnet` or `testnet` (default: `testnet`) |
| `--rpc-url <url>` | all | Override the Soroban RPC endpoint instead of reading it from env |
| `-f, --file <path>` | all | Read the transaction XDR from a file instead of an argument |
| `-e, --ecosystem <path>` | `field`, `gravity`, `analyze` | Path to an [ecosystem manifest](#ecosystem-manifest) JSON file |
| `--json` | all | Print raw JSON instead of a formatted report |
| `--skip-field` | `analyze` | Skip the FIELD dependency-mapping layer |
| `--skip-gravity` | `analyze` | Skip the GRAVITY blast-radius layer |
| `--confidence-threshold <n>` | `analyze` | Minimum confidence (0–1) required for a `CLEAR` verdict |
| `--no-brief` | `analyze` | Skip GenAI BRIEF synthesis (structured layers only) |
| `--api-key <key>` | `analyze` | Anthropic API key for BRIEF synthesis (else read from env) |

Advanced simulation options (`auth_mode`, `field_auth_mode`, `deep_discovery`) are available via the [REST API](#rest-api) `options` object or when calling `analyze()` from `@meridian/core` directly.

### Examples

```bash
# Full analysis (default command — "analyze" can be omitted)
meridian analyze <base64-xdr> --network testnet

# Read the XDR from a file
meridian analyze --file tx.xdr --network mainnet

# Pipe it in via stdin
cat tx.xdr | meridian analyze --network testnet --json

# Override the RPC endpoint without setting env vars
meridian analyze <base64-xdr> --network testnet --rpc-url https://soroban-testnet.stellar.org

# Score blast radius against a known ecosystem manifest
meridian gravity <base64-xdr> --ecosystem manifest.json --network testnet

# Fast structured-only analysis (no GenAI call)
meridian analyze <base64-xdr> --network testnet --no-brief

# TRACE only, fastest path
meridian trace <base64-xdr> --network testnet

# Check installed versions
meridian version
```

### Ecosystem Manifest

An optional JSON file describing known contracts in your ecosystem, used by `field`, `gravity`, and `analyze` to enrich dependency mapping, blast-radius scoring, and affected-user counts:

```json
{
  "name": "my-ecosystem",
  "version": "1.0.0",
  "contracts": [
    {
      "name": "token-vault",
      "address": "CABC...XYZ",
      "network": "testnet",
      "dependencies": ["CDEF...UVW"],
      "active_users": 4200,
      "criticality": "HIGH"
    }
  ]
}
```

## REST API

`@meridian/api` exposes the same pipeline over HTTP (Hono server, default port `3000`):

```bash
npm run dev --workspace=@meridian/api
```

| Method | Endpoint | Description |
|---|---|---|
| `GET`  | `/v1/health` | Health check |
| `GET`  | `/v1/version` | Product and engine version |
| `POST` | `/v1/analyze` | Full TRACE + FIELD + GRAVITY + BRIEF analysis |
| `POST` | `/v1/trace` | TRACE only |
| `POST` | `/v1/field` | TRACE + FIELD |
| `POST` | `/v1/gravity` | TRACE + FIELD + GRAVITY |

```bash
# Health check
curl http://localhost:3000/v1/health

# Full analysis
curl -X POST http://localhost:3000/v1/analyze \
  -H "Content-Type: application/json" \
  -d '{"tx": "<base64-xdr>", "network": "testnet"}'

# Full analysis with ecosystem manifest and simulation options
curl -X POST http://localhost:3000/v1/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "tx": "<base64-xdr>",
    "network": "mainnet",
    "ecosystem": { "name": "my-ecosystem", "version": "1.0.0", "contracts": [] },
    "options": {
      "auth_mode": "enforce",
      "field_auth_mode": "record",
      "deep_discovery": false,
      "confidence_threshold": 0.75
    }
  }'
```

### Analyze `options`

| Field | Type | Default | Description |
|---|---|---|---|
| `skip_field` | `boolean` | `false` | Skip FIELD dependency mapping |
| `skip_gravity` | `boolean` | `false` | Skip GRAVITY blast-radius scoring |
| `confidence_threshold` | `number` | `0.75` | Minimum confidence for a `CLEAR` verdict |
| `rpc_url` | `string` | env | Override Soroban RPC endpoint |
| `auth_mode` | `"enforce"` \| `"record"` \| `"record_allow_nonroot"` | `"enforce"` | Auth mode for TRACE simulation |
| `field_auth_mode` | `"enforce"` \| `"record"` \| `"record_allow_nonroot"` | `"record"` | Auth mode for FIELD dependency discovery |
| `deep_discovery` | `boolean` | `false` | When `true`, FIELD uses `record_allow_nonroot` for deep ecosystem mapping |

## Docker

Build and run the API server in a container from the repo root:

```bash
docker build -t meridian-api .

docker run --rm -p 3000:3000 \
  -e STELLAR_RPC_TESTNET=https://soroban-testnet.stellar.org \
  -e STELLAR_RPC_MAINNET=https://mainnet.sorobanrpc.com \
  -e ANTHROPIC_API_KEY=your-key-if-needed \
  meridian-api
```

The image uses a multi-stage build:
- builds `@meridian/core`, `@meridian/ai`, and `@meridian/api`
- starts `packages/api/dist/index.js`
- excludes local caches, test files, and other unnecessary artifacts via `.dockerignore`

## Environment Variables

See [`.env.example`](.env.example) for the full template. Every variable can also be overridden per-CLI-invocation with `--rpc-url` / `--api-key`.

| Variable | Required | Description |
|---|---|---|
| `STELLAR_RPC_TESTNET` | For testnet use | Soroban RPC endpoint for testnet |
| `STELLAR_RPC_MAINNET` | For mainnet use | Soroban RPC endpoint for mainnet |
| `ANTHROPIC_API_KEY` | No | Claude API key for BRIEF synthesis — falls back to a deterministic brief if unset |
| `LOG_LEVEL` | No | `debug` \| `info` \| `warn` \| `error` (default: `info`) |
| `PORT` | No | API server port (default: `3000`) |

## Monorepo Structure

```
packages/
├── core/    TRACE + FIELD + GRAVITY engines
├── ai/      BRIEF GenAI synthesis (Claude)
├── api/     REST API server (Hono)
└── cli/     meridian / meridian-core command-line interface
```

`packages/web/` is a local marketing site and is excluded from the published workspace (see `.gitignore`).

Managed with npm workspaces and [Turborepo](https://turbo.build/).

## Development

```bash
# Build every package
npm run build

# Build a single package
npm run build --workspace=@meridian/core

# Run all tests
npm test

# Typecheck everything
npm run typecheck

# Watch mode for the API server
npm run dev --workspace=@meridian/api

# Watch mode for the CLI (runs from source via tsx, no build step)
npm run dev --workspace=meridian-core
```

Each package can also be built, tested, and typechecked independently from its own directory (`packages/core`, `packages/ai`, `packages/api`, `packages/cli`).

## Roadmap

**Phase 1 — Vertical Slice** *(complete)*
- [x] `packages/core/trace` — simulateTransaction wrapper + XDR parser
- [x] `packages/ai/brief` — Claude API synthesis with fallback
- [x] `packages/api/` — POST /v1/analyze returning full response shape
- [x] `packages/cli/` — `meridian` / `meridian-core` command-line interface
- [x] Evidence-based GRAVITY scoring with explainability and batch analysis

**Phase 2 — Production Hardening** *(in progress)*
- [x] Network-aware RPC simulation (mainnet/testnet passphrases)
- [x] Soroban auth modes (`enforce`, `record`, `record_allow_nonroot`)
- [x] TTL / archival checks via `getLedgerEntries`
- [x] Enriched execution path (invoke, read, write, auth steps)
- [x] `memory_bytes` from simulation cost
- [x] Recovery assessment (`FULL` / `PARTIAL` / `NONE`)
- [x] Fix sequences on `WARN` and `ABORT` verdicts
- [x] FIELD deep discovery with record-mode re-simulation and on-chain WASM hashes
- [ ] End-to-end validation with ScholarSeal canonical test case
- [ ] CLI flags for `auth_mode`, `field_auth_mode`, and `deep_discovery`

## License

MIT
