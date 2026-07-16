import { Command } from 'commander';
import { analyzeDiff } from '../internal/meridian-core.js';
import type { AnalyzeDiffResponse, Network, SimulationAuthMode } from '../internal/meridian-core.js';
import { resolveTxInput } from '../lib/input.js';
import { loadManifest } from '../lib/manifest.js';
import { loadPolicyRules } from '../lib/policy.js';
import { failWithError, failWithMeridianError, isMeridianError } from '../lib/errors.js';
import { printDiff, printJson } from '../lib/output.js';
import { parseNetwork, withSimulationOptions } from '../lib/options.js';

interface DiffCommandOptions {
  network: Network;
  rpcUrl?: string;
  fileA?: string;
  fileB?: string;
  ecosystem?: string;
  policy?: string;
  json?: boolean;
  skipField?: boolean;
  skipGravity?: boolean;
  authMode?: SimulationAuthMode;
  fieldAuthMode?: SimulationAuthMode;
  deepDiscovery?: boolean;
}

/**
 * Build the `meridian diff` subcommand — compare tx A vs tx B for safest rewrite.
 */
export function diffCommand(): Command {
  const command = new Command('diff')
    .description(
      'Compare two transactions (A vs B): verdict, decision, contracts, auth, writes, and risks',
    )
    .argument('[tx_a]', 'Base64-encoded transaction XDR for baseline (A)')
    .argument('[tx_b]', 'Base64-encoded transaction XDR for candidate rewrite (B)')
    .option('-n, --network <network>', 'Stellar network (mainnet | testnet)', parseNetwork, 'testnet')
    .option('--rpc-url <url>', 'Override the Soroban RPC endpoint (else read from env)')
    .option('--file-a <path>', 'Read transaction A XDR from a file')
    .option('--file-b <path>', 'Read transaction B XDR from a file')
    .option('-e, --ecosystem <path>', 'Path to an ecosystem manifest JSON file')
    .option('--policy <path>', 'Path to a policy rules JSON file')
    .option('--skip-field', 'Skip the FIELD dependency-mapping layer')
    .option('--skip-gravity', 'Skip the GRAVITY blast-radius layer')
    .option('--json', 'Print raw JSON instead of a formatted report');

  withSimulationOptions(command).action(
    async (txAArg: string | undefined, txBArg: string | undefined, options: DiffCommandOptions) => {
      try {
        const txA = await resolveTxInput(txAArg, options.fileA);
        const txB = await resolveTxInput(txBArg, options.fileB);
        const ecosystem = await loadManifest(options.ecosystem);
        const policyRules = await loadPolicyRules(options.policy);

        const result = await analyzeDiff({
          tx_a: txA,
          tx_b: txB,
          network: options.network,
          ecosystem,
          options: {
            skip_field: options.skipField,
            skip_gravity: options.skipGravity,
            rpc_url: options.rpcUrl,
            policy_rules: policyRules,
            auth_mode: options.authMode,
            field_auth_mode: options.fieldAuthMode,
            deep_discovery: options.deepDiscovery,
          },
        });

        if (isMeridianError(result)) {
          if (options.json) {
            printJson(result);
            process.exit(1);
          }
          failWithMeridianError(result);
        }

        const response: AnalyzeDiffResponse = result;

        if (options.json) {
          printJson(response);
          return;
        }

        printDiff(response);
      } catch (err) {
        failWithError(err);
      }
    },
  );

  return command;
}
