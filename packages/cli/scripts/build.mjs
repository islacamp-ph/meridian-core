import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { chmodSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const corePkg = require('../../core/package.json');

const outfile = fileURLToPath(new URL('../dist/index.js', import.meta.url));

// Bundling collapses every source file into one on-disk location, so a
// runtime `require('../package.json')` inside @meridian/core would resolve
// relative to *this* bundle instead of the core package. We sidestep that by
// inlining the real core version as a compile-time constant here; see the
// `__MERIDIAN_ENGINE_VERSION__` fallback in packages/core/src/analyze.ts.
await build({
  entryPoints: [fileURLToPath(new URL('../src/index.ts', import.meta.url))],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile,
  alias: {
    '@meridian/core': fileURLToPath(new URL('../src/internal/meridian-core.ts', import.meta.url)),
    '@meridian/ai': fileURLToPath(new URL('../src/internal/meridian-ai.ts', import.meta.url)),
  },
  external: ['commander', 'picocolors', '@stellar/stellar-sdk', '@anthropic-ai/sdk'],
  define: {
    __MERIDIAN_ENGINE_VERSION__: JSON.stringify(corePkg.version),
  },
});

chmodSync(outfile, 0o755);

console.log(`Built ${outfile} (engine v${corePkg.version})`);
