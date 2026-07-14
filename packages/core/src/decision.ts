import type {
  Decision,
  DecisionAction,
  EcosystemManifest,
  FieldResult,
  GravityResult,
  RiskItem,
  RiskSeverity,
  TraceResult,
  Verdict,
} from './types.js';

/**
 * Build a pre-submit decision: submit | hold | rewrite with primary reason and top risks.
 */
export function buildDecision(input: {
  verdict: Verdict;
  confidence: number;
  trace: TraceResult;
  field: FieldResult;
  gravity: GravityResult;
  manifest?: EcosystemManifest;
  policyEffect?: 'ABORT' | 'WARN' | 'ALLOW';
}): Decision {
  const topRisks = collectTopRisks(input);
  const action = resolveAction(input.verdict, input.policyEffect, topRisks, input.trace);
  const reason = buildReason(action, input.verdict, topRisks, input.trace, input.policyEffect);

  return {
    action,
    reason,
    confidence: input.confidence,
    top_risks: topRisks.slice(0, 3),
  };
}

/**
 * Collect ranked risk items from TRACE / FIELD / GRAVITY evidence.
 */
export function collectTopRisks(input: {
  verdict: Verdict;
  confidence: number;
  trace: TraceResult;
  field: FieldResult;
  gravity: GravityResult;
  manifest?: EcosystemManifest;
}): RiskItem[] {
  const risks: RiskItem[] = [];
  const known = new Set(input.manifest?.contracts.map((c) => c.address) ?? []);

  if (!input.trace.success && input.trace.failure_point) {
    const fp = input.trace.failure_point;
    risks.push({
      id: `failure:${fp.error_code}`,
      severity: 'CRITICAL',
      title: `Simulation failed: ${fp.error_code}`,
      why_it_matters: fp.root_cause || fp.error_message,
      contract_id: fp.contract_id,
      factor_key: 'direct_failure_point',
    });
  }

  for (const warning of input.field.ttl_warnings) {
    risks.push({
      id: `ttl:${warning.contract_id}:${warning.severity}`,
      severity: warning.severity === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
      title: warning.severity === 'CRITICAL'
        ? 'Ledger entry archived / TTL expired'
        : 'Ledger entry nearing archival',
      why_it_matters: warning.severity === 'CRITICAL'
        ? 'Submission will fail or require restore; irreversible if timed poorly.'
        : `TTL remaining ${warning.ttl_remaining} ledgers — archive risk before submit.`,
      contract_id: warning.contract_id,
      factor_key: 'ttl_archival',
    });
  }

  for (const upgrade of input.field.upgrade_warnings) {
    risks.push({
      id: `upgrade:${upgrade.contract_id}`,
      severity: 'HIGH',
      title: 'WASM upgrade drift detected',
      why_it_matters: `On-chain WASM (${upgrade.on_chain_wasm_hash.slice(0, 8)}…) differs from manifest expected hash.`,
      contract_id: upgrade.contract_id,
      factor_key: 'upgradeable_dependency',
    });
  }

  for (const contract of input.gravity.affected_contracts) {
    if (contract.impact === 'SAFE') continue;
    const applied = contract.score_breakdown.factors.filter((f) => f.applied);
    const top = applied.sort((a, b) => b.weight - a.weight)[0];
    if (!top) continue;

    risks.push({
      id: `impact:${contract.address}:${top.key}`,
      severity: impactToSeverity(contract.impact),
      title: `${contract.name ?? contract.address}: ${top.label}`,
      why_it_matters: top.reason,
      contract_id: contract.address,
      factor_key: top.key,
    });
  }

  if (input.manifest) {
    for (const node of input.field.dependency_graph) {
      if (!known.has(node.address) && (node.depth ?? 0) === 0) {
        risks.push({
          id: `unknown:${node.address}`,
          severity: 'MEDIUM',
          title: 'Unknown contract in footprint',
          why_it_matters: 'Contract is not in the ecosystem manifest — behavior and upgrade posture unknown.',
          contract_id: node.address,
          factor_key: 'unknown_dependency',
        });
      }
    }
  }

  if (input.trace.staleness_warning) {
    risks.push({
      id: 'staleness',
      severity: 'MEDIUM',
      title: 'Stale simulation ledger',
      why_it_matters: 'Simulation may not reflect the latest network state; re-simulate before submit.',
      factor_key: 'staleness',
    });
  }

  if (input.gravity.blast_radius >= 50) {
    risks.push({
      id: 'blast_radius',
      severity: input.gravity.blast_radius >= 75 ? 'HIGH' : 'MEDIUM',
      title: `High blast radius (${input.gravity.blast_radius})`,
      why_it_matters: 'Transaction touches many high-impact contracts or user funds if something fails.',
      factor_key: 'blast_radius',
    });
  }

  return dedupeAndRank(risks).slice(0, 8);
}

function resolveAction(
  verdict: Verdict,
  policyEffect: 'ABORT' | 'WARN' | 'ALLOW' | undefined,
  topRisks: RiskItem[],
  trace: TraceResult,
): DecisionAction {
  if (policyEffect === 'ABORT' || verdict === 'ABORT') {
    if (trace.failure_point?.error_code === 'AUTH_REQUIRED') return 'rewrite';
    if (trace.failure_point?.error_code === 'ENTRY_ARCHIVED') return 'rewrite';
    if (topRisks.some((r) => r.factor_key === 'upgradeable_dependency')) return 'hold';
    return 'rewrite';
  }

  if (policyEffect === 'WARN' || verdict === 'WARN') {
    if (topRisks.some((r) => r.severity === 'CRITICAL' || r.severity === 'HIGH')) return 'hold';
    return 'hold';
  }

  return 'submit';
}

function buildReason(
  action: DecisionAction,
  verdict: Verdict,
  topRisks: RiskItem[],
  trace: TraceResult,
  policyEffect?: 'ABORT' | 'WARN' | 'ALLOW',
): string {
  const primary = topRisks[0];
  if (policyEffect === 'ABORT') {
    return primary
      ? `Policy blocked submission: ${primary.title}`
      : 'Policy blocked submission.';
  }

  if (action === 'submit') {
    return 'Simulation succeeded with acceptable blast radius and no blocking risks.';
  }

  if (action === 'rewrite') {
    if (trace.failure_point) {
      return `Do not submit — ${trace.failure_point.root_cause}. Apply remediations and rebuild the transaction.`;
    }
    return primary
      ? `Do not submit as-is — ${primary.why_it_matters}`
      : `Verdict ${verdict}: rewrite required before submit.`;
  }

  return primary
    ? `Hold submission — ${primary.title}. ${primary.why_it_matters}`
    : `Verdict ${verdict}: hold and review before submit.`;
}

function impactToSeverity(impact: string): RiskSeverity {
  switch (impact) {
    case 'CRITICAL':
      return 'CRITICAL';
    case 'WARNING':
      return 'HIGH';
    case 'MONITOR':
      return 'MEDIUM';
    default:
      return 'LOW';
  }
}

function dedupeAndRank(risks: RiskItem[]): RiskItem[] {
  const seen = new Set<string>();
  const severityRank: Record<RiskSeverity, number> = {
    CRITICAL: 4,
    HIGH: 3,
    MEDIUM: 2,
    LOW: 1,
  };

  return risks
    .filter((risk) => {
      if (seen.has(risk.id)) return false;
      seen.add(risk.id);
      return true;
    })
    .sort((a, b) => severityRank[b.severity] - severityRank[a.severity] || a.id.localeCompare(b.id));
}
