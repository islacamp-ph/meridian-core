import { Command } from 'commander';
import { buildFieldGraph, trace } from '../internal/meridian-core.js';
import type { Network } from '../internal/meridian-core.js';
import { resolveTxInput } from '../lib/input.js';
import { loadManifest } from '../lib/manifest.js';
import { failWithError, failWithMeridianError, isMeridianError } from '../lib/errors.js';
import { printField, printJson } from '../lib/output.js';
import { withCommonOptions } from '../lib/options.js';

interface FieldCommandOptions {
  network: Network;
  rpcUrl?: string;
  file?: string;
  ecosystem?: string;
  json?: boolean;
}

/**
 * Build the `meridian field` subcommand.
 *
 * @returns Configured commander Command
 */
export function fieldCommand(): Command {
  const command = new Command('field').description(
    'Run TRACE + FIELD — map the dependency graph touched by a transaction',
  );

  withCommonOptions(command).action(async (tx: string | undefined, options: FieldCommandOptions) => {
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

      if (options.json) {
        printJson(fieldResult);
        return;
      }

      printField(fieldResult);
    } catch (err) {
      failWithError(err);
    }
  });

  return command;
}
