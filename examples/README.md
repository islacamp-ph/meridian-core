# MERIDIAN Canonical Examples

Reference scenarios for validating MERIDIAN analysis behavior.

## Structure

Each example directory contains:

| File | Purpose |
|---|---|
| `README.md` | Scenario description and usage |
| `tx.xdr` | Base64-encoded transaction XDR |
| `manifest.json` | Optional inline ecosystem manifest |
| `expected.json` | Validation schema for CI |

## Examples

| Directory | Scenario |
|---|---|
| `scholar-seal/` | Scholarship disbursement ecosystem (canonical e2e case) |
| `ttl-expiry/` | Transaction touching entries with low TTL |
| `auth-failure/` | Transaction predicted to fail auth |
| `high-blast-radius/` | Transaction affecting many high-criticality contracts |

## Run an example

```bash
meridian analyze --file examples/scholar-seal/tx.xdr \
  --ecosystem manifests/scholar-seal/manifest.json \
  --network testnet --json
```

## Validate all examples

```bash
npm run validate:examples
```

This checks manifest structure and expected.json schemas. Live RPC validation runs in CI when `MERIDIAN_E2E=1` is set.

## Adding a new example

1. Create a directory under `examples/`.
2. Add `tx.xdr`, `README.md`, and `expected.json`.
3. Reference a community manifest from `manifests/` or include an inline `manifest.json`.
4. Run `npm run validate:examples`.
