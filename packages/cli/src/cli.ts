import { Command } from 'commander';
import { CLI_VERSION } from './version.js';
import { analyzeCommand } from './commands/analyze.js';
import { diffCommand } from './commands/diff.js';
import { traceCommand } from './commands/trace.js';
import { fieldCommand } from './commands/field.js';
import { gravityCommand } from './commands/gravity.js';
import { versionCommand } from './commands/version.js';
import { initCommand } from './commands/init.js';
import { manifestCommand } from './commands/manifest.js';

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
    .version(CLI_VERSION, '-v, --version', 'Print the meridian-core CLI version')
    .addHelpText(
      'after',
      `
Examples:
  $ meridian analyze <base64-xdr> --network testnet
  $ meridian analyze --file tx.xdr --policy policy.json --network testnet
  $ meridian analyze --file tx.xdr --auth-mode enforce --deep-discovery --network testnet
  $ cat tx.xdr | meridian analyze --network mainnet --json
  $ meridian analyze --file txs.json --network testnet
  $ meridian diff --file-a tx-a.xdr --file-b tx-b.xdr --network testnet
  $ meridian trace --file tx.xdr --network testnet
  $ meridian gravity <base64-xdr> --ecosystem manifest.json
  $ meridian init --name my-ecosystem --network testnet
  $ meridian manifest validate manifest.json

Environment:
  STELLAR_RPC_TESTNET   Soroban RPC endpoint for testnet (or use --rpc-url)
  STELLAR_RPC_MAINNET   Soroban RPC endpoint for mainnet (or use --rpc-url)
  ANTHROPIC_API_KEY     Claude API key for BRIEF synthesis (optional, falls back to a deterministic brief)
`,
    );

  program.addCommand(analyzeCommand(), { isDefault: true });
  program.addCommand(diffCommand());
  program.addCommand(traceCommand());
  program.addCommand(fieldCommand());
  program.addCommand(gravityCommand());
  program.addCommand(versionCommand());
  program.addCommand(initCommand());
  program.addCommand(manifestCommand());

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
