import type { MeridianError, MeridianLayer } from './types.js';

/**
 * Stellar RPC error taxonomy for classification.
 */
const STELLAR_ERROR_TAXONOMY: Record<string, { code: string; hint: string }> = {
  'transaction failed': {
    code: 'TX_FAILED',
    hint: 'Review simulation failure_point for the exact contract and function that failed.',
  },
  'bad sequence': {
    code: 'BAD_SEQUENCE',
    hint: 'Fetch the current account sequence number and rebuild the transaction.',
  },
  'tx_bad_auth': {
    code: 'BAD_AUTH',
    hint: 'Ensure all required signers have signed and auth entries are valid.',
  },
  'tx_insufficient_fee': {
    code: 'INSUFFICIENT_FEE',
    hint: 'Increase the fee to cover minResourceFee from simulation.',
  },
  'tx_too_early': {
    code: 'TX_TOO_EARLY',
    hint: 'Wait until the minTime precondition is satisfied.',
  },
  'tx_too_late': {
    code: 'TX_TOO_LATE',
    hint: 'Rebuild the transaction — the maxTime precondition has expired.',
  },
  'entry_archived': {
    code: 'ENTRY_ARCHIVED',
    hint: 'Restore the archived ledger entry before submitting.',
  },
  'contract_not_found': {
    code: 'CONTRACT_NOT_FOUND',
    hint: 'Verify the contract address exists on the target network.',
  },
  'timeout': {
    code: 'RPC_TIMEOUT',
    hint: 'Retry the request or check RPC endpoint availability.',
  },
  'network': {
    code: 'RPC_NETWORK_ERROR',
    hint: 'Check network connectivity and RPC endpoint configuration.',
  },
};

/**
 * Classify a raw Stellar RPC error into a structured MeridianError.
 *
 * @param raw - Raw error message or Error object
 * @param layer - MERIDIAN layer that produced the error
 * @returns Structured MeridianError
 */
export function classifyStellarError(raw: string | Error, layer: MeridianLayer): MeridianError {
  const message = typeof raw === 'string' ? raw : raw.message;
  const lower = message.toLowerCase();

  for (const [pattern, classification] of Object.entries(STELLAR_ERROR_TAXONOMY)) {
    if (lower.includes(pattern)) {
      return {
        error: message,
        code: classification.code,
        hint: classification.hint,
        layer,
      };
    }
  }

  return {
    error: message,
    code: 'STELLAR_UNKNOWN',
    hint: 'Check transaction XDR validity and network configuration.',
    layer,
  };
}

/**
 * Create a MeridianError with explicit fields.
 *
 * @param error - Human-readable error message
 * @param code - Machine-readable error code
 * @param hint - Actionable hint for the developer
 * @param layer - MERIDIAN layer that produced the error
 * @returns Structured MeridianError
 */
export function createMeridianError(
  error: string,
  code: string,
  hint: string,
  layer: MeridianLayer,
): MeridianError {
  return { error, code, hint, layer };
}
