import { Command } from 'commander';
import pc from 'picocolors';
import { failWithError } from '../lib/errors.js';
import { parseNetwork } from '../lib/options.js';
import { printJson } from '../lib/output.js';
import { resolveManifestPath, scaffoldManifest } from '../lib/manifest.js';
import type { Network } from '../internal/meridian-core.js';

interface InitCommandOptions {
  name?: string;
  network: Network;
  force?: boolean;
  json?: boolean;
}

/**
 * Build the `meridian init` subcommand.
 *
 * @returns Configured commander Command
 */
export function initCommand(): Command {
  return new Command('init')
    .description('Scaffold a starter ecosystem manifest JSON file')
    .argument('[path]', 'Output path for the manifest file', 'manifest.json')
    .option('--name <name>', 'Ecosystem name', 'my-ecosystem')
    .option('-n, --network <network>', 'Default network for the example contract', parseNetwork, 'testnet')
    .option('--force', 'Overwrite an existing manifest file')
    .option('--json', 'Print raw JSON instead of a formatted report')
    .action(async (path: string, options: InitCommandOptions) => {
      try {
        const outputPath = resolveManifestPath(path);
        const name = options.name?.trim() || 'my-ecosystem';
        const createdPath = await scaffoldManifest({
          path: outputPath,
          name,
          network: options.network,
          force: options.force,
        });

        if (options.json) {
          printJson({
            created: true,
            path: createdPath,
            name,
            network: options.network,
            hint: `Run "meridian manifest validate ${createdPath}" to verify the file.`,
          });
          return;
        }

        console.log(pc.green(pc.bold('✓ Created ecosystem manifest')));
        console.log(`  path: ${createdPath}`);
        console.log(`  name: ${name}`);
        console.log(pc.dim(`\nNext: edit contract addresses, then run "meridian manifest validate ${createdPath}"`));
      } catch (err) {
        if (err instanceof Error && 'code' in err && err.code === 'EEXIST') {
          failWithError(
            new Error(
              `Manifest already exists at ${resolveManifestPath(path)}. Use --force to overwrite.`,
            ),
          );
        }
        failWithError(err);
      }
    });
}
