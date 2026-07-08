# ScholarSeal

Canonical MERIDIAN test case — a scholarship disbursement ecosystem on Stellar testnet.

## Contracts

| Name | Role | Criticality |
|---|---|---|
| `scholarship-registry` | Student credential registry | HIGH |
| `disbursement-vault` | Scholarship payment vault | HIGH |
| `credential-verifier` | Off-chain credential attestation | MEDIUM |

## Usage

```bash
meridian analyze --file examples/scholar-seal/tx.xdr \
  --ecosystem manifests/scholar-seal/manifest.json \
  --network testnet
```

## Expected behavior

A disbursement transaction through this ecosystem should:

- Map all three contracts via footprint and manifest BFS
- Score blast radius based on `active_users` and `criticality`
- Return a verdict based on simulation outcome and TTL state

See `examples/scholar-seal/expected.json` for the validation schema used in CI.
