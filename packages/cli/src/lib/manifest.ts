import { readFile, writeFile } from 'node:fs/promises';
import type { EcosystemManifest, Network } from '../internal/meridian-core.js';

export interface ManifestValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  manifest?: EcosystemManifest;
}

export interface ScaffoldManifestOptions {
  path: string;
  name: string;
  network: Network;
  force?: boolean;
}

const DEFAULT_MANIFEST_PATH = 'manifest.json';

/**
 * Load and parse an ecosystem manifest JSON file.
 *
 * @param filePath - Path to the manifest JSON file
 * @returns Parsed EcosystemManifest, or undefined if no path was given
 * @throws If the file cannot be read or does not contain valid JSON
 */
export async function loadManifest(filePath?: string): Promise<EcosystemManifest | undefined> {
  if (!filePath) return undefined;

  const parsed = await readManifestJson(filePath);
  const validation = validateEcosystemManifest(parsed);
  if (!validation.valid || !validation.manifest) {
    throw new Error(
      `Ecosystem manifest at ${filePath} failed validation:\n${validation.errors.map((e) => `  - ${e}`).join('\n')}`,
    );
  }

  return validation.manifest;
}

/**
 * Read and parse a manifest JSON file without structural validation.
 *
 * @param filePath - Path to the manifest JSON file
 * @returns Parsed JSON value
 * @throws If the file cannot be read or is not valid JSON
 */
export async function readManifestJson(filePath: string): Promise<unknown> {
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf-8');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to read ecosystem manifest at ${filePath}: ${message}`);
  }

  try {
    return JSON.parse(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Ecosystem manifest at ${filePath} is not valid JSON: ${message}`);
  }
}

/**
 * Validate an ecosystem manifest object against the MERIDIAN schema.
 *
 * @param value - Parsed JSON value to validate
 * @param options - Validation options
 * @returns Validation result with errors and warnings
 */
export function validateEcosystemManifest(
  value: unknown,
  options: { strict?: boolean } = {},
): ManifestValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isRecord(value)) {
    return { valid: false, errors: ['Manifest must be a JSON object.'], warnings };
  }

  if (options.strict) {
    const allowedKeys = new Set(['name', 'version', 'contracts']);
    for (const key of Object.keys(value)) {
      if (!allowedKeys.has(key)) {
        warnings.push(`Unknown top-level key "${key}".`);
      }
    }
  }

  const name = readRequiredString(value.name, 'name', errors);
  const version = readRequiredString(value.version, 'version', errors);
  if (!Array.isArray(value.contracts)) {
    errors.push('contracts must be an array.');
    return { valid: false, errors, warnings };
  }

  if (value.contracts.length === 0) {
    warnings.push('contracts array is empty — manifest coverage will be low.');
  }

  const contracts = value.contracts
    .map((contract, index) => readManifestContract(contract, `contracts[${index}]`, errors))
    .filter((contract): contract is EcosystemManifest['contracts'][number] => contract !== null);

  if (!name || !version || errors.length > 0) {
    return { valid: false, errors, warnings };
  }

  const manifest: EcosystemManifest = { name, version, contracts };
  validateManifestSemantics(manifest, errors, warnings);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    manifest: errors.length === 0 ? manifest : undefined,
  };
}

/**
 * Validate a manifest file on disk.
 *
 * @param filePath - Path to the manifest JSON file
 * @param options - Validation options
 * @returns Validation result including the resolved file path
 */
export async function validateManifestFile(
  filePath: string,
  options: { strict?: boolean } = {},
): Promise<ManifestValidationResult & { path: string }> {
  const parsed = await readManifestJson(filePath);
  const result = validateEcosystemManifest(parsed, options);
  return { ...result, path: filePath };
}

/**
 * Write a starter ecosystem manifest file.
 *
 * @param options - Scaffold options
 * @returns Path to the created manifest file
 * @throws If the file already exists and force is not set
 */
export async function scaffoldManifest(options: ScaffoldManifestOptions): Promise<string> {
  const manifest: EcosystemManifest = {
    name: options.name,
    version: '1.0.0',
    contracts: [
      {
        name: 'example-contract',
        address: 'C...',
        network: options.network,
        dependencies: [],
        active_users: 0,
        criticality: 'MEDIUM',
      },
    ],
  };

  const contents = `${JSON.stringify(manifest, null, 2)}\n`;
  await writeFile(options.path, contents, { encoding: 'utf-8', flag: options.force ? 'w' : 'wx' });
  return options.path;
}

/**
 * Resolve a manifest file path, defaulting to manifest.json in the current directory.
 *
 * @param filePath - Optional explicit path
 * @returns Resolved path
 */
export function resolveManifestPath(filePath?: string): string {
  return filePath?.trim() || DEFAULT_MANIFEST_PATH;
}

function validateManifestSemantics(
  manifest: EcosystemManifest,
  errors: string[],
  warnings: string[],
): void {
  const addresses = manifest.contracts.map((contract) => contract.address);
  const addressSet = new Set(addresses);

  const duplicates = addresses.filter((address, index) => addresses.indexOf(address) !== index);
  for (const address of new Set(duplicates)) {
    errors.push(`Duplicate contract address "${address}".`);
  }

  for (const contract of manifest.contracts) {
    for (const dependency of contract.dependencies ?? []) {
      if (!addressSet.has(dependency)) {
        errors.push(
          `Contract "${contract.name}" (${contract.address}) references unknown dependency "${dependency}".`,
        );
      }
    }
  }

  if (manifest.contracts.some((contract) => contract.address === 'C...')) {
    warnings.push('Replace placeholder address "C..." with a real contract address.');
  }
}

function readManifestContract(
  value: unknown,
  path: string,
  errors: string[],
): EcosystemManifest['contracts'][number] | null {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return null;
  }

  const name = readRequiredString(value.name, `${path}.name`, errors);
  const address = readRequiredString(value.address, `${path}.address`, errors);
  const network = readNetwork(value.network, `${path}.network`, errors);
  const dependencies = readOptionalStringArray(value.dependencies, `${path}.dependencies`, errors);
  const activeUsers = readOptionalNumber(value.active_users, `${path}.active_users`, errors);
  const criticality = readOptionalEnum(
    value.criticality,
    `${path}.criticality`,
    ['HIGH', 'MEDIUM', 'LOW'] as const,
    errors,
  );
  const role = readOptionalString(value.role, `${path}.role`, errors);
  const expectedWasmHash = readOptionalWasmHash(value.expected_wasm_hash, `${path}.expected_wasm_hash`, errors);

  if (!name || !address || !network) return null;
  return {
    name,
    address,
    network,
    dependencies,
    active_users: activeUsers,
    criticality,
    role,
    expected_wasm_hash: expectedWasmHash,
  };
}

function readRequiredString(value: unknown, path: string, errors: string[]): string | undefined {
  if (typeof value !== 'string' || value.trim().length === 0) {
    errors.push(`${path} must be a non-empty string.`);
    return undefined;
  }
  return value.trim();
}

function readOptionalString(value: unknown, path: string, errors: string[]): string | undefined {
  if (value === undefined) return undefined;
  return readRequiredString(value, path, errors);
}

function readNetwork(value: unknown, path: string, errors: string[]): Network | undefined {
  if (value !== 'mainnet' && value !== 'testnet') {
    errors.push(`${path} must be "mainnet" or "testnet".`);
    return undefined;
  }
  return value;
}

function readOptionalStringArray(value: unknown, path: string, errors: string[]): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.trim().length === 0)) {
    errors.push(`${path} must be an array of non-empty strings.`);
    return undefined;
  }
  return value.map((item) => item.trim());
}

function readOptionalNumber(value: unknown, path: string, errors: string[]): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
    errors.push(`${path} must be a non-negative number.`);
    return undefined;
  }
  return value;
}

function readOptionalEnum<T extends string>(
  value: unknown,
  path: string,
  allowed: readonly T[],
  errors: string[],
): T | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    errors.push(`${path} must be one of: ${allowed.join(', ')}.`);
    return undefined;
  }
  return value as T;
}

function readOptionalWasmHash(value: unknown, path: string, errors: string[]): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !/^[0-9a-fA-F]{64}$/.test(value.trim())) {
    errors.push(`${path} must be a 64-character hex-encoded SHA-256 hash.`);
    return undefined;
  }
  return value.trim().toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
