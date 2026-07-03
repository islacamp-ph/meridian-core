/**
 * Internal re-export shim for @meridian/core.
 *
 * Imported via a relative path (instead of the bare "@meridian/core" specifier) so
 * esbuild resolves it directly on the file system during bundling. This avoids
 * package-resolution machinery entirely (including any ancestor Yarn PnP manifest),
 * which matters because @meridian/core is a private workspace-only package that is
 * never published — its code must be inlined into the CLI's bundle at build time.
 */
export * from '../../../core/src/index.js';
