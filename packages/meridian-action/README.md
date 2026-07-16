# meridian-action

GitHub Action for running MERIDIAN pre-execution analysis in CI.

## Usage

```yaml
- uses: ./packages/meridian-action
  with:
    tx-file: path/to/tx.xdr
    network: testnet
    ecosystem-manifest: manifests/my-ecosystem/manifest.json
    policy: policy.json
    fail-on: ABORT
    fail-on-decision: hold,rewrite
```

### Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `tx` | No* | — | Base64-encoded transaction XDR |
| `tx-file` | No* | — | Path to a file containing the XDR |
| `network` | No | `testnet` | `mainnet` or `testnet` |
| `ecosystem-manifest` | No | — | Path to ecosystem manifest JSON |
| `policy` | No | — | Path to policy rules JSON (pre-merge gates) |
| `fail-on` | No | `ABORT` | Fail the step on `ABORT` or `WARN` |
| `fail-on-decision` | No | `hold,rewrite` | Fail when `decision.action` matches (comma-separated). Empty disables. |
| `api-url` | No | — | MERIDIAN API URL (uses CLI when unset) |
| `api-key` | No | — | API key for authenticated deployments |
| `no-brief` | No | `true` | Skip GenAI brief synthesis |

\* One of `tx` or `tx-file` is required.

### Outputs

| Output | Description |
|---|---|
| `verdict` | `CLEAR`, `WARN`, or `ABORT` |
| `decision` | `submit`, `hold`, or `rewrite` |
| `confidence` | Confidence score (0–1) |
| `blast-radius` | GRAVITY blast radius (0–100) |
| `top-risks` | JSON array of top risks |
| `brief` | Plain-language risk brief |

## Example: PR check requiring submit

```yaml
name: MERIDIAN

on:
  pull_request:
    paths:
      - 'contracts/**'

jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: ./packages/meridian-action
        id: meridian
        with:
          tx-file: examples/scholar-seal/tx.xdr
          network: testnet
          ecosystem-manifest: manifests/scholar-seal/manifest.json
          policy: policy.json
          fail-on: WARN
          fail-on-decision: hold,rewrite

      - name: Surface risks
        run: |
          echo "blast=${{ steps.meridian.outputs.blast-radius }}"
          echo '${{ steps.meridian.outputs.top-risks }}' | jq .
```
