import { readFile } from 'node:fs/promises';
import type { EcosystemManifest } from '../internal/meridian-core.js';

/**
 * Load and parse an ecosystem manifest JSON file.
 *
 * @param filePath - Path to the manifest JSON file
 * @returns Parsed EcosystemManifest, or undefined if no path was given
 * @throws If the file cannot be read or does not contain valid JSON
 */
export async function loadManifest(filePath?: string): Promise<EcosystemManifest | undefined> {
  if (!filePath) return undefined;

  let raw: string;
  try {
    raw = await readFile(filePath, 'utf-8');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to read ecosystem manifest at ${filePath}: ${message}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Ecosystem manifest at ${filePath} is not valid JSON: ${message}`);
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !Array.isArray((parsed as Record<string, unknown>).contracts)
  ) {
    throw new Error(
      `Ecosystem manifest at ${filePath} must be an object with a "contracts" array.`,
    );
  }

  return parsed as EcosystemManifest;
}
