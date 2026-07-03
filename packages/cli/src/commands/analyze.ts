import { Command } from 'commander';
import { analyze } from '../internal/meridian-core.js';
import type { AnalyzeResponse, Network } from '../internal/meridian-core.js';
import { synthesizeBrief, generateFallbackBrief } from '../internal/meridian-ai.js';
import { resolveTxInput } from '../lib/input.js';
import { loadManifest } from '../lib/manifest.js';
import { failWithError, failWithMeridianError, isMeridianError } from '../lib/errors.js';
import { printAnalysis, printJson } from '../lib/output.js';
import { parseThreshold, withCommonOptions } from '../lib/options.js';

interface AnalyzeCommandOptions {
  network: Network;
  rpcUrl?: string;
  file?: string;
  ecosystem?: string;
  json?: boolean;
  skipField?: boolean;
  skipGravity?: boolean;
  confidenceThreshold?: number;
  brief: boolean;
  apiKey?: string;
}

/**
 * Build the `meridian analyze` subcommand (default command).
 *
 * @returns Configured commander Command
 */
export function analyzeCommand(): Command {
  const command = new Command('analyze').description(
    'Run the full MERIDIAN pipeline (TRACE + FIELD + GRAVITY + BRIEF) on a transaction',
  );

  withCommonOptions(command)
    .option('--skip-field', 'Skip the FIELD dependency-mapping layer')
    .option('--skip-gravity', 'Skip the GRAVITY blast-radius layer')
    .option('--confidence-threshold <n>', 'Minimum confidence required for a CLEAR verdict', parseThreshold)
    .option('--no-brief', 'Skip GenAI BRIEF synthesis (structured layers only)')
    .option('--api-key <key>', 'Anthropic API key for BRIEF synthesis (else read from env)')
    .action(async (tx: string | undefined, options: AnalyzeCommandOptions) => {
      try {
        const txXdr = await resolveTxInput(tx, options.file);
        const ecosystem = await loadManifest(options.ecosystem);

        const result = await analyze({
          tx: txXdr,
          network: options.network,
          ecosystem,
          options: {
            skip_field: options.skipField,
            skip_gravity: options.skipGravity,
            confidence_threshold: options.confidenceThreshold,
            rpc_url: options.rpcUrl,
          },
        });

        if (isMeridianError(result)) {
          if (options.json) {
            printJson(result);
            process.exit(1);
          }
          failWithMeridianError(result);
        }

        let brief = 'BRIEF synthesis skipped (--no-brief).';
        let warnings = result.warnings;

        if (options.brief) {
          const briefInput = {
            verdict: result.verdict,
            confidence: result.confidence,
            trace: result.trace,
            field: result.field,
            gravity: result.gravity,
            fix_sequence: result.fix_sequence,
            warnings: result.warnings,
          };

          const briefResult = await synthesizeBrief(briefInput, { apiKey: options.apiKey });

          if (isMeridianError(briefResult)) {
            brief = generateFallbackBrief(briefInput);
            warnings = [...(result.warnings ?? []), briefResult.error];
          } else {
            brief = briefResult;
          }
        }

        const response: AnalyzeResponse = { ...result, brief, warnings };

        if (options.json) {
          printJson(response);
          return;
        }

        printAnalysis(response);
      } catch (err) {
        failWithError(err);
      }
    });

  return command;
}
