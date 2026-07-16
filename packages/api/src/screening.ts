import type { AnalyzeRequest, PolicyRule } from '@meridian/core';

export type ScreeningProfile = 'exchange' | 'custodian' | 'treasury' | 'wallet';

export const SCREENING_PROFILES = ['exchange', 'custodian', 'treasury', 'wallet'] as const;

export function isScreeningProfile(value: unknown): value is ScreeningProfile {
  return typeof value === 'string' && (SCREENING_PROFILES as readonly string[]).includes(value);
}

/**
 * Default policy packs for exchange / custodian / treasury / wallet screening.
 */
export function buildScreeningPolicyRules(profile: ScreeningProfile): PolicyRule[] {
  switch (profile) {
    case 'exchange':
      return [
        { type: 'unknown_contract', effect: 'ABORT' },
        { type: 'allowlist_only', effect: 'ABORT' },
        { type: 'max_blast_radius', threshold: 35, effect: 'ABORT' },
        { type: 'require_approval', threshold: 20, effect: 'WARN' },
        { type: 'max_slippage', effect: 'WARN' },
        { type: 'untrusted_counterparty', threshold: 70, effect: 'ABORT' },
        { type: 'upgrade_risk', effect: 'ABORT' },
        { type: 'admin_auth_path', effect: 'ABORT' },
      ];
    case 'custodian':
      return [
        { type: 'unknown_contract', effect: 'ABORT' },
        { type: 'allowlist_only', effect: 'ABORT' },
        { type: 'max_blast_radius', threshold: 25, effect: 'ABORT' },
        { type: 'require_approval', threshold: 10, effect: 'WARN' },
        { type: 'untrusted_counterparty', threshold: 80, effect: 'ABORT' },
        { type: 'upgrade_risk', effect: 'ABORT' },
        { type: 'ttl_critical', effect: 'ABORT' },
        { type: 'admin_auth_path', effect: 'ABORT' },
        { type: 'min_confidence', min_confidence: 0.85, effect: 'WARN' },
      ];
    case 'treasury':
      return [
        { type: 'unknown_contract', effect: 'ABORT' },
        { type: 'max_blast_radius', threshold: 40, effect: 'WARN' },
        { type: 'require_approval', threshold: 25, effect: 'WARN' },
        { type: 'admin_auth_path', effect: 'WARN' },
        { type: 'upgrade_risk', effect: 'WARN' },
        { type: 'untrusted_counterparty', threshold: 60, effect: 'WARN' },
      ];
    case 'wallet':
    default:
      return [
        { type: 'unknown_contract', effect: 'WARN' },
        { type: 'require_approval', threshold: 50, effect: 'WARN' },
        { type: 'max_slippage', effect: 'WARN' },
        { type: 'admin_auth_path', effect: 'WARN' },
      ];
  }
}

/**
 * Merge profile policy pack with request options (and optional allowlist).
 */
export function mergeScreeningOptions(
  profile: ScreeningProfile,
  request: AnalyzeRequest,
  allowlist?: string[],
): AnalyzeRequest {
  const profileRules = buildScreeningPolicyRules(profile)
    .map((rule) => {
      if (rule.type === 'allowlist_only' && allowlist?.length) {
        return { ...rule, allowlist };
      }
      return rule;
    })
    .filter((rule) => {
      if (rule.type === 'allowlist_only' && !rule.allowlist?.length) {
        return false;
      }
      return true;
    });

  return {
    ...request,
    options: {
      ...request.options,
      policy_rules: [
        ...profileRules,
        ...(request.options?.policy_rules ?? []),
      ],
    },
  };
}
