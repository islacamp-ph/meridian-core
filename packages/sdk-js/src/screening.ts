import type {
  AnalyzeResponse,
  DecisionAction,
  PolicyRule,
  StructuredAnalyzeResponse,
  Verdict,
} from '@meridian/core';

export type ScreeningProfile = 'exchange' | 'custodian' | 'treasury' | 'wallet';

export type ScreeningDisposition = 'allow' | 'review' | 'block';

export interface ScreeningResult {
  product: 'MERIDIAN';
  profile: ScreeningProfile;
  disposition: ScreeningDisposition;
  reason: string;
  verdict: Verdict;
  decision: DecisionAction;
  confidence: number;
  blast_radius: number;
  policy_effect?: string;
  top_risks: Array<{ severity: string; title: string; why_it_matters: string }>;
  applied_rules: PolicyRule[];
}

/**
 * Default policy packs for exchange / custodian / treasury / wallet screening.
 */
export function screeningPolicyRules(profile: ScreeningProfile): PolicyRule[] {
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
        { type: 'max_amount', threshold: 0, effect: 'WARN' },
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
 * Map an analysis result + screening profile into allow / review / block.
 */
export function toScreeningResult(
  analysis: StructuredAnalyzeResponse | AnalyzeResponse,
  profile: ScreeningProfile,
  appliedRules: PolicyRule[] = screeningPolicyRules(profile),
): ScreeningResult {
  const decision = analysis.decision.action;
  const policyEffect = analysis.policy?.effect;
  let disposition: ScreeningDisposition = 'allow';
  let reason = 'Screening passed — safe to proceed under this profile.';

  if (
    analysis.verdict === 'ABORT'
    || decision === 'rewrite'
    || policyEffect === 'ABORT'
  ) {
    disposition = 'block';
    reason = analysis.decision.reason || 'Blocked by verdict, rewrite decision, or policy ABORT.';
  } else if (
    analysis.verdict === 'WARN'
    || decision === 'hold'
    || policyEffect === 'WARN'
  ) {
    disposition = 'review';
    reason = analysis.decision.reason || 'Requires human review under this screening profile.';
  }

  return {
    product: 'MERIDIAN',
    profile,
    disposition,
    reason,
    verdict: analysis.verdict,
    decision,
    confidence: analysis.confidence,
    blast_radius: analysis.gravity.blast_radius,
    policy_effect: policyEffect,
    top_risks: analysis.top_risks.slice(0, 3).map((risk) => ({
      severity: risk.severity,
      title: risk.title,
      why_it_matters: risk.why_it_matters,
    })),
    applied_rules: appliedRules,
  };
}
