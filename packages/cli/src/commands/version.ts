import { Command } from 'commander';
import { MERIDIAN_VERSION } from '../internal/meridian-core.js';
import { CLI_VERSION } from '../version.js';
import { printJson } from '../lib/output.js';

/**
 * Build the `meridian version` subcommand.
 *
 * @returns Configured commander Command
 */
export function versionCommand(): Command {
  return new Command('version')
    .description('Print MERIDIAN CLI and core engine version')
    .option('--json', 'Print raw JSON instead of a formatted report')
    .action((options: { json?: boolean }) => {
      if (options.json) {
        printJson({ product: 'MERIDIAN', cli_version: CLI_VERSION, engine_version: MERIDIAN_VERSION });
        return;
      }
      console.log(`meridian-core v${CLI_VERSION} (engine v${MERIDIAN_VERSION})`);
    });
}
