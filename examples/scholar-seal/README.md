# ScholarSeal — Canonical E2E Case

The ScholarSeal example validates the full MERIDIAN pipeline against a scholarship disbursement scenario on Stellar testnet.

## Run

```bash
meridian analyze --file examples/scholar-seal/tx.xdr \
  --ecosystem manifests/scholar-seal/manifest.json \
  --network testnet --json
```

## Validate structure

```bash
npm run validate:examples
```

## Expected fields

See `expected.json` for the validation schema. When running against live RPC (`MERIDIAN_E2E=1`), the validator checks:

- `verdict` matches expected value
- `field.contracts_mapped` meets minimum threshold
- `gravity.blast_radius` is within expected range

## Note on tx.xdr

The `tx.xdr` file contains a placeholder increment-contract transaction for structural validation. Replace with a real ScholarSeal disbursement XDR for production e2e testing against live testnet RPC.
