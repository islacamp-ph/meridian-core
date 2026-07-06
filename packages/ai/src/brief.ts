import Anthropic from '@anthropic-ai/sdk';
import type {
  AnalyzeResponse,
  FieldResult,
  GravityResult,
  MeridianError,
  TraceResult,
  Verdict,
} from '@meridian/core';
import { createMeridianError } from '@meridian/core';

const BRIEF_MODEL = 'claude-sonnet-4-6';
const MAX_BRIEF_WORDS = 300;

const BRIEF_SYSTEM_PROMPT = `You are MERIDIAN BRIEF — a Stellar pre-execution risk synthesis engine.

Your job: produce a structured mission briefing from TRACE and GRAVITY JSON inputs.
You must NEVER hallucinate contract names, addresses, ledger values, or user counts.
Every specific fact must come from the provided structured data.

## Stellar Error Taxonomy
- AUTH_REQUIRED: Missing or invalid require_auth credentials
- ENTRY_ARCHIVED: Ledger entry TTL expired or archived
- INSUFFICIENT_BALANCE: Account lacks required balance
- BAD_SEQUENCE: Transaction sequence number mismatch
- TX_FAILED: General simulation failure

## Output Format (strict, max 300 words)
1. **Verdict Reason** (1-2 sentences): Why CLEAR, WARN, or ABORT
2. **Affected Parties**: Who is impacted and how many users (from GRAVITY data only)
3. **Fix Sequence**: Numbered steps with estimated stroop costs (from fix_sequence data)
4. **Confidence**: Explain confidence score; if < 0.75, explicitly recommend re-running after fixes

Never use conversational prose. Be direct and actionable.`;

export interface BriefInput {
  verdict: Verdict;
  confidence: number;
  trace: TraceResult;
  field: FieldResult;
  gravity: GravityResult;
  fix_sequence?: AnalyzeResponse['fix_sequence'];
  warnings?: string[];
}

export interface BriefOptions {
  apiKey?: string;
  maxWords?: number;
}

/**
 * Count words in a string.
 *
 * @param text - Input text
 * @returns Word count
 */
function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Truncate text to a maximum word count.
 *
 * @param text - Input text
 * @param maxWords - Maximum words allowed
 * @returns Truncated text
 */
function truncateToWordLimit(text: string, maxWords: number): string {
  if (countWords(text) <= maxWords) return text;
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.slice(0, maxWords).join(' ') + '…';
}

/**
 * Generate a deterministic fallback brief when Claude API is unavailable.
 *
 * @param input - Brief synthesis input
 * @returns Plain-language brief string
 */
export function generateFallbackBrief(input: BriefInput): string {
  const lines: string[] = [];

  lines.push(`**Verdict: ${input.verdict}** (confidence: ${input.confidence})`);

  if (!input.trace.success && input.trace.failure_point) {
    const fp = input.trace.failure_point;
    lines.push(
      `Simulation failed at step ${fp.step_index}: ${fp.root_cause} (${fp.error_code}).`,
    );
  } else {
    lines.push('Transaction simulation succeeded with no critical failures detected.');
  }

  if (input.gravity.total_affected_users > 0) {
    lines.push(
      `**Affected Parties**: ${input.gravity.total_affected_users} users across ${input.gravity.affected_contracts.length} contracts.`,
    );
  }

  if (input.gravity.critical.length > 0) {
    lines.push(`**Critical contracts**: ${input.gravity.critical.join(', ')}`);
  }

  if (input.fix_sequence && input.fix_sequence.length > 0) {
    lines.push('**Fix Sequence**:');
    for (const step of input.fix_sequence) {
      lines.push(
        `${step.order}. ${step.operation}: ${step.description} (~${step.estimated_cost_stroops} stroops, ~${step.estimated_time_minutes}min)`,
      );
    }
  }

  if (input.confidence < 0.75) {
    lines.push(
      `**Confidence**: ${input.confidence} is below the 0.75 threshold. Re-run analysis after applying fixes.`,
    );
  }

  if (input.warnings && input.warnings.length > 0) {
    lines.push(`**Warnings**: ${input.warnings.join('; ')}`);
  }

  return truncateToWordLimit(lines.join('\n'), MAX_BRIEF_WORDS);
}

/**
 * Synthesize a plain-language risk brief using Claude claude-sonnet-4-6.
 * Grounded strictly in TRACE + GRAVITY structured outputs.
 *
 * @param input - Brief synthesis input with layer results
 * @param options - Optional API key and word limit
 * @returns Brief string or MeridianError
 */
export async function synthesizeBrief(
  input: BriefInput,
  options?: BriefOptions,
): Promise<string | MeridianError> {
  const apiKey = options?.apiKey ?? process.env.ANTHROPIC_API_KEY;
  const maxWords = options?.maxWords ?? MAX_BRIEF_WORDS;

  if (!apiKey) {
    return generateFallbackBrief(input);
  }

  const client = new Anthropic({ apiKey });

  const contextPayload = {
    verdict: input.verdict,
    confidence: input.confidence,
    trace: {
      success: input.trace.success,
      failure_point: input.trace.failure_point,
      execution_path: input.trace.execution_path,
      auth_entries: input.trace.auth_entries,
      fee_estimate: input.trace.fee_estimate,
      staleness_warning: input.trace.staleness_warning,
    },
    gravity: {
      blast_radius: input.gravity.blast_radius,
      affected_contracts: input.gravity.affected_contracts,
      critical: input.gravity.critical,
      warning: input.gravity.warning,
      total_affected_users: input.gravity.total_affected_users,
      recovery: input.gravity.recovery,
    },
    fix_sequence: input.fix_sequence,
    warnings: input.warnings,
  };

  try {
    const response = await client.messages.create({
      model: BRIEF_MODEL,
      max_tokens: 1024,
      system: BRIEF_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Synthesize a MERIDIAN risk brief from this structured analysis data:\n\n${JSON.stringify(contextPayload, null, 2)}`,
        },
      ],
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return createMeridianError(
        'BRIEF synthesis returned no text content',
        'BRIEF_EMPTY',
        'Retry the analysis or check Anthropic API status',
        'BRIEF',
      );
    }

    return truncateToWordLimit(textBlock.text, maxWords);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return createMeridianError(
      `BRIEF synthesis failed: ${message}`,
      'BRIEF_API_ERROR',
      'Check ANTHROPIC_API_KEY and retry. Fallback brief will be used.',
      'BRIEF',
    );
  }
}
