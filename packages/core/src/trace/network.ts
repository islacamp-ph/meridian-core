import { Networks, TransactionBuilder } from '@stellar/stellar-sdk';
import type { Network } from '../types.js';

const MAINNET_PASSPHRASE = Networks.PUBLIC;
const TESTNET_PASSPHRASE = Networks.TESTNET;

/**
 * Resolve the Stellar network passphrase for a MERIDIAN network identifier.
 *
 * @param network - Target network
 * @returns Network passphrase string
 */
export function resolveNetworkPassphrase(network: Network): string {
  return network === 'mainnet' ? MAINNET_PASSPHRASE : TESTNET_PASSPHRASE;
}

/**
 * Parse a transaction XDR using the preferred network passphrase, with fallback.
 *
 * @param txXdr - Base64-encoded transaction XDR
 * @param network - Preferred network (defaults to testnet)
 * @returns Parsed transaction envelope
 */
export function parseTransactionFromXdr(txXdr: string, network: Network = 'testnet') {
  const preferred = resolveNetworkPassphrase(network);
  const fallback = network === 'mainnet' ? TESTNET_PASSPHRASE : MAINNET_PASSPHRASE;

  try {
    return TransactionBuilder.fromXDR(txXdr, preferred);
  } catch {
    return TransactionBuilder.fromXDR(txXdr, fallback);
  }
}
