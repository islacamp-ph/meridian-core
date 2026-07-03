import { Command } from 'commander';
import { MERIDIAN_VERSION } from '@meridian/core';
import { printJson } from '../lib/output.js';

/**
 * Build the `meridian version` subcommand.
 *
 * @returns Configured commander Command
 */
export function versionCommand(): Command {
  return new Command('version')
    .description('Print MERIDIAN product and core engine version')
    .option('--json', 'Print raw JSON instead of a formatted report')
    .action((options: { json?: boolean }) => {
      if (options.json) {
        printJson({ product: 'MERIDIAN', version: MERIDIAN_VERSION });
        return;
      }
      console.log(`MERIDIAN v${MERIDIAN_VERSION}`);
    });
}
