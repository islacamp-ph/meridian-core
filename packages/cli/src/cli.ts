import { Command } from 'commander';
import { MERIDIAN_VERSION } from './internal/meridian-core.js';
import { analyzeCommand } from './commands/analyze.js';
import { traceCommand } from './commands/trace.js';
import { fieldCommand } from './commands/field.js';
import { gravityCommand } from './commands/gravity.js';
import { versionCommand } from './commands/version.js';

/**
 * Build the root `meridian` commander program with all subcommands attached.
 *
 * @returns Configured commander Command ready to parse argv
 */
export function buildProgram(): Command {
  const program = new Command('meridian')
    .description(
      'MERIDIAN — pre-execution intelligence for Stellar developers.\n' +
        'Know what crosses before it does.',
    )
    .version(MERIDIAN_VERSION, '-v, --version', 'Print the MERIDIAN version')
    .addHelpText(
      'after',
      `
Examples:
  $ meridian analyze <base64-xdr> --network testnet
  $ cat tx.xdr | meridian analyze --network mainnet --json
  $ meridian trace --file tx.xdr --network testnet
  $ meridian gravity <base64-xdr> --ecosystem manifest.json

Environment:
  STELLAR_RPC_TESTNET   Soroban RPC endpoint for testnet (or use --rpc-url)
  STELLAR_RPC_MAINNET   Soroban RPC endpoint for mainnet (or use --rpc-url)
  ANTHROPIC_API_KEY     Claude API key for BRIEF synthesis (optional, falls back to a deterministic brief)
`,
    );

  program.addCommand(analyzeCommand(), { isDefault: true });
  program.addCommand(traceCommand());
  program.addCommand(fieldCommand());
  program.addCommand(gravityCommand());
  program.addCommand(versionCommand());

  return program;
}

/**
 * Parse argv and run the MERIDIAN CLI.
 *
 * @param argv - Process argv (defaults to process.argv)
 */
export async function runCli(argv: string[] = process.argv): Promise<void> {
  const program = buildProgram();
  await program.parseAsync(argv);
}
