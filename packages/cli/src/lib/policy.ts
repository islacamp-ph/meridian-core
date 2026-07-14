import { readFile } from 'node:fs/promises';
import type { PolicyRule } from '../internal/meridian-core.js';

const POLICY_RULE_TYPES = new Set([
  'unknown_contract',
  'admin_auth_path',
  'max_blast_radius',
  'allowlist_only',
  'ttl_critical',
  'upgrade_risk',
  'min_confidence',
]);

const POLICY_EFFECTS = new Set(['ABORT', 'WARN', 'ALLOW']);

/**
 * Load policy rules from a JSON file.
 * Accepts either a bare array of rules or `{ "rules": [...] }`.
 */
export async function loadPolicyRules(filePath?: string): Promise<PolicyRule[] | undefined> {
  if (!filePath) return undefined;

  const contents = await readFile(filePath, 'utf-8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    throw new Error(`Invalid policy JSON in ${filePath}: file must contain valid JSON.`);
  }

  const rawRules = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.rules)
      ? parsed.rules
      : null;

  if (!rawRules) {
    throw new Error(
      `Invalid policy file ${filePath}: expected an array of rules or an object with a "rules" array.`,
    );
  }

  const errors: string[] = [];
  const rules = rawRules
    .map((rule, index) => readPolicyRule(rule, `rules[${index}]`, errors))
    .filter((rule): rule is PolicyRule => rule !== null);

  if (errors.length > 0) {
    throw new Error(`Invalid policy file ${filePath}:\n  - ${errors.join('\n  - ')}`);
  }

  return rules.length > 0 ? rules : undefined;
}

function readPolicyRule(
  value: unknown,
  path: string,
  errors: string[],
): PolicyRule | null {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return null;
  }

  if (typeof value.type !== 'string' || !POLICY_RULE_TYPES.has(value.type)) {
    errors.push(
      `${path}.type must be one of: ${[...POLICY_RULE_TYPES].join(', ')}.`,
    );
    return null;
  }

  let effect: PolicyRule['effect'];
  if (value.effect !== undefined) {
    if (typeof value.effect !== 'string' || !POLICY_EFFECTS.has(value.effect)) {
      errors.push(`${path}.effect must be one of: ABORT, WARN, ALLOW.`);
    } else {
      effect = value.effect as PolicyRule['effect'];
    }
  }

  let allowlist: string[] | undefined;
  if (value.allowlist !== undefined) {
    if (!Array.isArray(value.allowlist) || value.allowlist.some((item) => typeof item !== 'string')) {
      errors.push(`${path}.allowlist must be an array of strings.`);
    } else {
      allowlist = value.allowlist.map((item) => item.trim()).filter(Boolean);
    }
  }

  let threshold: number | undefined;
  if (value.threshold !== undefined) {
    if (typeof value.threshold !== 'number' || Number.isNaN(value.threshold) || value.threshold < 0) {
      errors.push(`${path}.threshold must be a non-negative number.`);
    } else {
      threshold = value.threshold;
    }
  }

  let minConfidence: number | undefined;
  if (value.min_confidence !== undefined) {
    if (
      typeof value.min_confidence !== 'number' ||
      Number.isNaN(value.min_confidence) ||
      value.min_confidence < 0 ||
      value.min_confidence > 1
    ) {
      errors.push(`${path}.min_confidence must be a number between 0 and 1.`);
    } else {
      minConfidence = value.min_confidence;
    }
  }

  let label: string | undefined;
  if (value.label !== undefined) {
    if (typeof value.label !== 'string' || value.label.trim().length === 0) {
      errors.push(`${path}.label must be a non-empty string.`);
    } else {
      label = value.label.trim();
    }
  }

  return {
    type: value.type as PolicyRule['type'],
    ...(effect !== undefined ? { effect } : {}),
    ...(threshold !== undefined ? { threshold } : {}),
    ...(allowlist !== undefined ? { allowlist } : {}),
    ...(minConfidence !== undefined ? { min_confidence: minConfidence } : {}),
    ...(label !== undefined ? { label } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
