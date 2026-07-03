import pc from 'picocolors';
import type { MeridianError } from '@meridian/core';

/**
 * Check if a value is a structured MeridianError.
 *
 * @param value - Value to check
 * @returns True if the value matches the MeridianError shape
 */
export function isMeridianError(value: unknown): value is MeridianError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'layer' in value &&
    'code' in value &&
    'hint' in value
  );
}

/**
 * Print a MeridianError to stderr and exit the process with code 1.
 *
 * @param error - Structured MeridianError to report
 */
export function failWithMeridianError(error: MeridianError): never {
  console.error(pc.red(pc.bold(`✖ [${error.layer}] ${error.code}`)));
  console.error(pc.red(error.error));
  console.error(pc.dim(`hint: ${error.hint}`));
  process.exit(1);
}

/**
 * Print a generic error to stderr and exit the process with code 1.
 *
 * @param err - Error or unknown thrown value
 */
export function failWithError(err: unknown): never {
  const message = err instanceof Error ? err.message : String(err);
  console.error(pc.red(pc.bold('✖ Error')));
  console.error(pc.red(message));
  process.exit(1);
}
