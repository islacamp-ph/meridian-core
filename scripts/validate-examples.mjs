#!/usr/bin/env node
/**
 * Validate example directory structure and expected.json schemas.
 * When MERIDIAN_E2E=1, runs live analysis against Soroban RPC.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const examplesDir = join(root, 'examples');

function getByPath(obj, path) {
  return path.split('.').reduce((acc, key) => acc?.[key], obj);
}

function checkAssertion(value, assertion) {
  if (assertion.oneOf && !assertion.oneOf.includes(value)) {
    return `expected one of ${assertion.oneOf.join(', ')}, got ${value}`;
  }
  if (assertion.equals !== undefined && value !== assertion.equals) {
    return `expected ${assertion.equals}, got ${value}`;
  }
  if (assertion.type === 'boolean' && typeof value !== 'boolean') {
    return `expected boolean, got ${typeof value}`;
  }
  if (assertion.min !== undefined && typeof value === 'number' && value < assertion.min) {
    return `expected >= ${assertion.min}, got ${value}`;
  }
  if (assertion.max !== undefined && typeof value === 'number' && value > assertion.max) {
    return `expected <= ${assertion.max}, got ${value}`;
  }
  if (assertion.minLength !== undefined && Array.isArray(value) && value.length < assertion.minLength) {
    return `expected length >= ${assertion.minLength}, got ${value.length}`;
  }
  return null;
}

let failed = 0;

for (const entry of await readdir(examplesDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;

  const exampleDir = join(examplesDir, entry.name);
  const label = `examples/${entry.name}`;

  for (const required of ['tx.xdr', 'expected.json', 'README.md']) {
    try {
      await readFile(join(exampleDir, required));
    } catch {
      console.error(`FAIL ${label}: missing ${required}`);
      failed++;
      continue;
    }
  }

  const expected = JSON.parse(await readFile(join(exampleDir, 'expected.json'), 'utf-8'));
  if (!expected.assertions) {
    console.error(`FAIL ${label}: expected.json missing assertions`);
    failed++;
    continue;
  }

  console.log(`OK   ${label} structure`);

  if (process.env.MERIDIAN_E2E === '1') {
    const { analyze } = await import('../packages/core/dist/index.js');
    const tx = (await readFile(join(exampleDir, 'tx.xdr'), 'utf-8')).trim();
    const manifestPath = expected.manifest
      ? join(root, expected.manifest)
      : join(exampleDir, 'manifest.json');

    let ecosystem;
    try {
      ecosystem = JSON.parse(await readFile(manifestPath, 'utf-8'));
    } catch {
      ecosystem = undefined;
    }

    const result = await analyze({
      tx,
      network: expected.network ?? 'testnet',
      ecosystem,
      options: { confidence_threshold: 0 },
    });

    if ('error' in result) {
      console.error(`FAIL ${label} e2e: ${result.error}`);
      failed++;
      continue;
    }

    for (const [path, assertion] of Object.entries(expected.assertions)) {
      const value = getByPath(result, path);
      const err = checkAssertion(value, assertion);
      if (err) {
        console.error(`FAIL ${label} e2e assertion ${path}: ${err}`);
        failed++;
      }
    }

    if (expected.e2e?.expected_verdict && result.verdict !== expected.e2e.expected_verdict) {
      console.error(
        `FAIL ${label} e2e: expected verdict ${expected.e2e.expected_verdict}, got ${result.verdict}`,
      );
      failed++;
    } else {
      console.log(`OK   ${label} e2e (verdict: ${result.verdict})`);
    }
  }
}

if (failed > 0) {
  console.error(`\n${failed} example(s) failed validation`);
  process.exit(1);
}

console.log('\nAll examples valid');
