# meridian-action

GitHub Action for running MERIDIAN pre-execution analysis in CI.

## Usage

```yaml
- uses: ./packages/meridian-action
  with:
    tx-file: path/to/tx.xdr
    network: testnet
    ecosystem-manifest: manifests/my-ecosystem/manifest.json
    fail-on: ABORT
```

### Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `tx` | No* | — | Base64-encoded transaction XDR |
| `tx-file` | No* | — | Path to a file containing the XDR |
| `network` | No | `testnet` | `mainnet` or `testnet` |
| `ecosystem-manifest` | No | — | Path to ecosystem manifest JSON |
| `fail-on` | No | `ABORT` | Fail the step on `ABORT` or `WARN` |
| `api-url` | No | — | MERIDIAN API URL (uses CLI when unset) |
| `api-key` | No | — | API key for authenticated deployments |
| `no-brief` | No | `true` | Skip GenAI brief synthesis |

\* One of `tx` or `tx-file` is required.

### Outputs

| Output | Description |
|---|---|
| `verdict` | `CLEAR`, `WARN`, or `ABORT` |
| `confidence` | Confidence score (0–1) |
| `brief` | Plain-language risk brief |

## Example: PR check

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
        with:
          tx-file: examples/scholar-seal/tx.xdr
          network: testnet
          ecosystem-manifest: manifests/scholar-seal/manifest.json
          fail-on: WARN
```
