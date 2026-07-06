/**
 * Internal re-export shim for @meridian/core.
 *
 * The CLI consumes the built `dist` entrypoint so TypeScript sees the same
 * declarations that Turbo uses after `@meridian/core` builds.
 */
export * from '../../../core/dist/index.js';
export type * from '../../../core/dist/index.js';
