import { Command } from 'commander';
import { trace } from '@meridian/core';
import { resolveTxInput } from '../lib/input.js';
import { failWithError, failWithMeridianError, isMeridianError } from '../lib/errors.js';
import { printJson, printTrace } from '../lib/output.js';
import { withCommonOptions } from '../lib/options.js';
import type { Network } from '@meridian/core';

interface TraceCommandOptions {
  network: Network;
  rpcUrl?: string;
  file?: string;
  json?: boolean;
}

/**
 * Build the `meridian trace` subcommand.
 *
 * @returns Configured commander Command
 */
export function traceCommand(): Command {
  const command = new Command('trace').description(
    'Run the TRACE engine only — simulate a transaction and report the execution path',
  );

  withCommonOptions(command).action(async (tx: string | undefined, options: TraceCommandOptions) => {
    try {
      const txXdr = await resolveTxInput(tx, options.file);
      const result = await trace(txXdr, { network: options.network, rpcUrl: options.rpcUrl });

      if (isMeridianError(result)) {
        if (options.json) {
          printJson(result);
          process.exit(1);
        }
        failWithMeridianError(result);
      }

      if (options.json) {
        printJson(result);
        return;
      }

      printTrace(result);
    } catch (err) {
      failWithError(err);
    }
  });

  return command;
}
