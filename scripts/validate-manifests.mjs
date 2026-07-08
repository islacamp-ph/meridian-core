#!/usr/bin/env node
/**
 * Validate all ecosystem manifests in manifests/.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const manifestsDir = join(root, 'manifests');

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateManifest(value) {
  const errors = [];
  if (!isRecord(value)) return { valid: false, errors: ['Manifest must be a JSON object.'] };
  if (typeof value.name !== 'string' || value.name.trim() === '') {
    errors.push('name is required and must be a non-empty string');
  }
  if (typeof value.version !== 'string' || value.version.trim() === '') {
    errors.push('version is required and must be a non-empty string');
  }
  if (!Array.isArray(value.contracts)) {
    errors.push('contracts must be an array');
    return { valid: false, errors };
  }
  const seen = new Set();
  for (let i = 0; i < value.contracts.length; i++) {
    const c = value.contracts[i];
    const prefix = `contracts[${i}]`;
    if (!isRecord(c)) {
      errors.push(`${prefix} must be an object`);
      continue;
    }
    if (typeof c.name !== 'string' || c.name.trim() === '') {
      errors.push(`${prefix}.name is required`);
    }
    if (typeof c.address !== 'string' || !c.address.startsWith('C')) {
      errors.push(`${prefix}.address must be a contract address (C...)`);
    }
    if (c.network !== 'mainnet' && c.network !== 'testnet') {
      errors.push(`${prefix}.network must be mainnet or testnet`);
    }
    if (c.address && seen.has(c.address)) {
      errors.push(`duplicate contract address: ${c.address}`);
    }
    if (c.address) seen.add(c.address);
  }
  return { valid: errors.length === 0, errors };
}

let failed = 0;

for (const entry of await readdir(manifestsDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;

  const manifestPath = join(manifestsDir, entry.name, 'manifest.json');
  let raw;
  try {
    raw = JSON.parse(await readFile(manifestPath, 'utf-8'));
  } catch (err) {
    console.error(`FAIL ${manifestPath}: ${err instanceof Error ? err.message : err}`);
    failed++;
    continue;
  }

  const result = validateManifest(raw);
  if (result.valid) {
    console.log(`OK   ${manifestPath}`);
  } else {
    console.error(`FAIL ${manifestPath}:`);
    for (const e of result.errors) console.error(`  - ${e}`);
    failed++;
  }
}

if (failed > 0) {
  console.error(`\n${failed} manifest(s) failed validation`);
  process.exit(1);
}

console.log('\nAll manifests valid');
