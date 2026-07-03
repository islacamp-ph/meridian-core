import { Command, InvalidArgumentError } from 'commander';
import type { Network } from '@meridian/core';

/**
 * Parse and validate a --network option value.
 *
 * @param value - Raw CLI argument
 * @returns Validated Network
 * @throws InvalidArgumentError if the value is not "mainnet" or "testnet"
 */
export function parseNetwork(value: string): Network {
  if (value !== 'mainnet' && value !== 'testnet') {
    throw new InvalidArgumentError('Network must be "mainnet" or "testnet".');
  }
  return value;
}

/**
 * Parse and validate a --confidence-threshold option value.
 *
 * @param value - Raw CLI argument
 * @returns Parsed float between 0 and 1
 * @throws InvalidArgumentError if the value is not a number in range
 */
export function parseThreshold(value: string): number {
  const parsed = Number.parseFloat(value);
  if (Number.isNaN(parsed) || parsed < 0 || parsed > 1) {
    throw new InvalidArgumentError('Confidence threshold must be a number between 0 and 1.');
  }
  return parsed;
}

/**
 * Attach the options shared by every layer command (network, RPC, input, output).
 *
 * @param command - Commander command to extend
 * @returns The same command, for chaining
 */
export function withCommonOptions(command: Command): Command {
  return command
    .argument('[tx]', 'Base64-encoded transaction XDR')
    .option('-n, --network <network>', 'Stellar network (mainnet | testnet)', parseNetwork, 'testnet')
    .option('--rpc-url <url>', 'Override the Soroban RPC endpoint (else read from env)')
    .option('-f, --file <path>', 'Read the transaction XDR from a file instead of an argument')
    .option('-e, --ecosystem <path>', 'Path to an ecosystem manifest JSON file')
    .option('--json', 'Print raw JSON instead of a formatted report');
}
