# Auth Failure Scenario

Validates TRACE detection of authorization failures during simulation.

## Expected behavior

- `trace.success` is `false`
- `trace.failure_point.error_code` is `AUTH_REQUIRED` or similar
- Verdict is `ABORT`

## Run

```bash
meridian analyze --file examples/auth-failure/tx.xdr --network testnet --json
```
