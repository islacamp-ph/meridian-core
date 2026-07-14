# meridian-core

**MERIDIAN command-line interface — pre-execution intelligence for Stellar developers, from your terminal.**

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/armlynobinguar/meridian-core/blob/main/LICENSE)
[![npm](https://img.shields.io/npm/v/meridian-core?label=meridian-core)](https://www.npmjs.com/package/meridian-core)

MERIDIAN simulates a Stellar transaction end-to-end, maps every contract it touches downstream, scores what breaks if something goes wrong, and returns a plain-language GenAI risk brief — all before you submit.

Full project docs, architecture, and the REST API live in the [monorepo README](https://github.com/armlynobinguar/meridian-core#readme). This package is the standalone `meridian` / `meridian-core` CLI.

## Install

```bash
npm install -g meridian-core
meridian-core --help
```

## Requirements

- Node.js **>= 20**
- A Soroban RPC endpoint for the network you're targeting (testnet/mainnet)
- *(Optional)* An [Anthropic API key](https://console.anthropic.com/) for GenAI-synthesized briefs — falls back to a deterministic brief without one

## Verdict States

| Verdict | Meaning |
|---|---|
| 🟢 `CLEAR` | Safe to submit |
| 🟡 `WARN`  | Submit with caution — review warnings |
| 🔴 `ABORT` | Do not submit — critical failure predicted |

## Commands

| Command | Description |
|---|---|
| `meridian analyze [tx]` | Full pipeline: TRACE + FIELD + GRAVITY + BRIEF *(default command)* |
| `meridian diff [tx_a] [tx_b]` | Compare two txs (A vs B) for safest rewrite |
| `meridian trace [tx]` | TRACE only — simulate and report the execution path |
| `meridian field [tx]` | TRACE + FIELD — map the dependency graph touched by the transaction |
| `meridian gravity [tx]` | TRACE + FIELD + GRAVITY — score the blast radius |
| `meridian version` | Print CLI and engine version |
| `meridian init [path]` | Scaffold a starter ecosystem manifest JSON file |
| `meridian manifest validate [path]` | Validate an ecosystem manifest JSON file |
| `meridian --help` / `meridian <command> --help` | Show detailed help |

`tx` is the base64-encoded transaction XDR. It can be passed as an argument, via `--file`, or piped over stdin.

## Options

| Flag | Applies to | Description |
|---|---|---|
| `-n, --network <network>` | all | `mainnet` or `testnet` (default: `testnet`) |
| `--rpc-url <url>` | all | Override the Soroban RPC endpoint instead of reading it from env |
| `-f, --file <path>` | all | Read the transaction XDR from a file instead of an argument |
| `-e, --ecosystem <path>` | `field`, `gravity`, `analyze`, `diff` | Path to an ecosystem manifest JSON file |
| `--policy <path>` | `analyze`, `diff` | Path to a policy rules JSON file (pre-merge gates) |
| `--json` | all | Print raw JSON instead of a formatted report |
| `--skip-field` | `analyze`, `diff` | Skip the FIELD dependency-mapping layer |
| `--skip-gravity` | `analyze`, `diff` | Skip the GRAVITY blast-radius layer |
| `--confidence-threshold <n>` | `analyze` | Minimum confidence (0–1) required for a `CLEAR` verdict |
| `--no-brief` | `analyze` | Skip GenAI BRIEF synthesis (structured layers only) |
| `--api-key <key>` | `analyze` | Anthropic API key for BRIEF synthesis (else read from env) |
| `--file-a` / `--file-b` | `diff` | Read tx A / tx B XDR from files |

## Examples

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

# Scaffold and validate an ecosystem manifest
meridian init --name my-ecosystem --network testnet
meridian manifest validate manifest.json
```

## Ecosystem Manifest

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

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `STELLAR_RPC_TESTNET` | For testnet use | Soroban RPC endpoint for testnet |
| `STELLAR_RPC_MAINNET` | For mainnet use | Soroban RPC endpoint for mainnet |
| `ANTHROPIC_API_KEY` | No | Claude API key for BRIEF synthesis — falls back to a deterministic brief if unset |

## License

MIT — see the [monorepo repository](https://github.com/armlynobinguar/meridian-core) for full source and license details.
