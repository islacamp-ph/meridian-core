# meridian-py

Python SDK for [MERIDIAN](https://github.com/armlynobinguar/meridian-core) — pre-execution intelligence for Stellar developers.

## Install

```bash
pip install meridian-py
```

From the monorepo:

```bash
pip install ./packages/sdk-py
```

## Usage

```python
from meridian import MeridianClient

client = MeridianClient("http://localhost:3000", api_key="optional-key")

result = client.analyze({
    "tx": "<base64-xdr>",
    "network": "testnet",
})

print(result["verdict"], result["confidence"])
print(result["brief"])
```

### Individual layers

```python
trace = client.trace("<base64-xdr>", "testnet")
field = client.field("<base64-xdr>", "testnet", ecosystem={...})
gravity = client.gravity("<base64-xdr>", "testnet")
```

### Batch analysis

```python
batch = client.analyze_batch({
    "items": [
        {"id": "tx-1", "tx": "<xdr-1>", "network": "testnet"},
        {"id": "tx-2", "tx": "<xdr-2>", "network": "testnet"},
    ],
})
print(batch["summary"])
```

### Diff (safest rewrite)

```python
diff = client.analyze_diff({
    "tx_a": "<baseline-xdr>",
    "tx_b": "<rewrite-xdr>",
    "network": "testnet",
    "options": {
        "policy_rules": [{"type": "unknown_contract", "effect": "ABORT"}],
    },
})
print(diff["diff"]["summary"], diff["b"]["decision"]["action"])
```

## Local engines

For offline analysis without the HTTP API, use the JavaScript engines via Node or call the `meridian-core` CLI. Native Python engine bindings are planned for a future release.
