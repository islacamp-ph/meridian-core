# High Blast Radius Scenario

Validates GRAVITY scoring when a transaction touches many high-criticality contracts.

## Run

```bash
meridian analyze --file examples/high-blast-radius/tx.xdr \
  --ecosystem manifests/scholar-seal/manifest.json \
  --network testnet --json
```

## Expected behavior

- `gravity.blast_radius` exceeds threshold
- Multiple contracts in `gravity.critical` or `gravity.warning`
- `gravity.total_affected_users` > 0 when manifest is provided
