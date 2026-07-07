import { Command } from 'commander';
import { buildFieldGraph, scoreGravity, trace } from '../internal/meridian-core.js';
import type { Network } from '../internal/meridian-core.js';
import { resolveTxInput } from '../lib/input.js';
import { loadManifest } from '../lib/manifest.js';
import { failWithError, failWithMeridianError, isMeridianError } from '../lib/errors.js';
import { printGravity, printJson } from '../lib/output.js';
import { withCommonOptions } from '../lib/options.js';

interface GravityCommandOptions {
  network: Network;
  rpcUrl?: string;
  file?: string;
  ecosystem?: string;
  json?: boolean;
}

/**
 * Build the `meridian gravity` subcommand.
 *
 * @returns Configured commander Command
 */
export function gravityCommand(): Command {
  const command = new Command('gravity').description(
    'Run TRACE + FIELD + GRAVITY — score the blast radius of a transaction',
  );

  withCommonOptions(command).action(
    async (tx: string | undefined, options: GravityCommandOptions) => {
      try {
        const txXdr = await resolveTxInput(tx, options.file);
        const manifest = await loadManifest(options.ecosystem);

        const traceResult = await trace(txXdr, { network: options.network, rpcUrl: options.rpcUrl });
        if (isMeridianError(traceResult)) {
          if (options.json) {
            printJson(traceResult);
            process.exit(1);
          }
          failWithMeridianError(traceResult);
        }

        const fieldResult = await buildFieldGraph(traceResult, traceResult.simulation_context, {
          network: options.network,
          manifest,
          txXdr,
          rpcUrl: options.rpcUrl,
        });

        const gravityResult = scoreGravity(traceResult, fieldResult, { manifest });

        if (options.json) {
          printJson(gravityResult);
          return;
        }

        printGravity(gravityResult);
      } catch (err) {
        failWithError(err);
      }
    },
  );

  return command;
}
