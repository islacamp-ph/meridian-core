# TTL Expiry Scenario

Validates FIELD TTL warning detection for ledger entries nearing archival expiry.

## Expected behavior

When run against live RPC with a transaction touching low-TTL entries:

- `field.ttl_warnings` contains at least one entry
- Warning severity is `WARNING` or `CRITICAL`
- GRAVITY recovery may be `PARTIAL` or `NONE`

## Run

```bash
meridian analyze --file examples/ttl-expiry/tx.xdr --network testnet --json
```
