import { Command } from 'commander';
import pc from 'picocolors';
import { failWithError } from '../lib/errors.js';
import { printJson } from '../lib/output.js';
import { resolveManifestPath, validateManifestFile } from '../lib/manifest.js';

interface ManifestValidateOptions {
  json?: boolean;
  strict?: boolean;
}

/**
 * Build the `meridian manifest` command group.
 *
 * @returns Configured commander Command with validate subcommand
 */
export function manifestCommand(): Command {
  const manifest = new Command('manifest').description('Work with ecosystem manifest files');

  manifest
    .command('validate')
    .description('Validate an ecosystem manifest JSON file')
    .argument('[path]', 'Path to the manifest JSON file', 'manifest.json')
    .option('--json', 'Print raw JSON instead of a formatted report')
    .option('--strict', 'Warn on unknown top-level keys')
    .action(async (path: string, options: ManifestValidateOptions) => {
      try {
        const manifestPath = resolveManifestPath(path);
        const result = await validateManifestFile(manifestPath, { strict: options.strict });

        if (options.json) {
          printJson({
            valid: result.valid,
            path: result.path,
            contracts: result.manifest?.contracts.length ?? 0,
            errors: result.errors,
            warnings: result.warnings,
          });
          if (!result.valid) process.exit(1);
          return;
        }

        if (!result.valid) {
          console.error(pc.red(pc.bold('✖ Invalid ecosystem manifest')));
          console.error(pc.dim(`path: ${result.path}\n`));
          for (const error of result.errors) {
            console.error(pc.red(`  • ${error}`));
          }
          process.exit(1);
        }

        const contractCount = result.manifest?.contracts.length ?? 0;
        console.log(pc.green(pc.bold('✓ Valid ecosystem manifest')));
        console.log(`  path: ${result.path}`);
        console.log(`  contracts: ${contractCount}`);
        for (const warning of result.warnings) {
          console.log(pc.yellow(`  warning: ${warning}`));
        }
      } catch (err) {
        failWithError(err);
      }
    });

  return manifest;
}
