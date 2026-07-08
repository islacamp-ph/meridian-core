# Community Ecosystem Manifests

Shared ecosystem manifests for MERIDIAN dependency mapping and blast-radius scoring.

## Structure

```
manifests/
├── README.md
└── <ecosystem-name>/
    ├── manifest.json
    └── README.md
```

## Validate all manifests

```bash
npm run validate:manifests
```

Or individually:

```bash
meridian manifest validate manifests/<ecosystem>/manifest.json
```

## Contributing

1. Create a directory under `manifests/` with your ecosystem name.
2. Add a `manifest.json` following the [schema](../packages/core/src/types.ts).
3. Include a `README.md` describing the contracts and use case.
4. Run `npm run validate:manifests` before submitting a PR.

## Using in analysis

```bash
meridian analyze <xdr> --ecosystem manifests/scholar-seal/manifest.json --network testnet
```

Or inline via the REST API `ecosystem` field.
