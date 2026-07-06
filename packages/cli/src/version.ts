import { createRequire } from 'node:module';

// esbuild resolves and inlines this at build time (relative to this source file),
// so there is no runtime file-system dependency in the published bundle.
const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

/** The published version of the meridian-core CLI package itself (from package.json). */
export const CLI_VERSION: string = version;
