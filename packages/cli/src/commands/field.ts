import { Command } from 'commander';
import { buildFieldGraph, trace } from '@meridian/core';
import type { Network } from '@meridian/core';
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

      const fieldResult = buildFieldGraph(
        traceResult,
        {
          ledgerSequence: 0,
          latestLedger: 0,
          footprintContracts: [],
          readOnly: [],
          readWrite: [],
        },
        { network: options.network, manifest },
      );

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
