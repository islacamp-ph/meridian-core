import { collectTokenMovements } from './graph.js';
import type {
  EcosystemManifest,
  FieldResult,
  GravityResult,
  PolicyEffect,
  PolicyResult,
  PolicyRule,
  PolicyViolation,
  TokenMovement,
  TraceResult,
} from './types.js';

const DEFAULT_EFFECT: Record<PolicyRule['type'], PolicyEffect> = {
  unknown_contract: 'ABORT',
  admin_auth_path: 'WARN',
  max_blast_radius: 'ABORT',
  allowlist_only: 'ABORT',
  ttl_critical: 'ABORT',
  upgrade_risk: 'WARN',
  min_confidence: 'WARN',
  max_slippage: 'WARN',
  max_amount: 'ABORT',
  require_approval: 'WARN',
  untrusted_counterparty: 'WARN',
};

/**
 * Evaluate deterministic policy rules over an analysis result.
 * Same engine for CI, wallets, and treasury approval flows.
 */
export function evaluatePolicy(input: {
  rules: PolicyRule[];
  trace: TraceResult;
  field: FieldResult;
  gravity: GravityResult;
  confidence: number;
  manifest?: EcosystemManifest;
  token_movements?: TokenMovement[];
}): PolicyResult {
  const violations: PolicyViolation[] = [];
  const known = new Set(input.manifest?.contracts.map((c) => c.address) ?? []);
  const observed = new Set([
    ...input.field.dependency_graph.map((n) => n.address),
    ...input.trace.simulation_context.footprintContracts,
    ...input.trace.execution_path.map((s) => s.contract_id).filter((v): v is string => Boolean(v)),
  ]);
  const tokenMovements = input.token_movements ?? collectTokenMovements(input.trace);

  for (const rule of input.rules) {
    const effect = rule.effect ?? DEFAULT_EFFECT[rule.type];

    switch (rule.type) {
      case 'unknown_contract': {
        for (const address of observed) {
          if (!known.has(address)) {
            violations.push({
              rule_type: rule.type,
              effect,
              message: rule.label ?? `Unknown contract touched: ${address}`,
              contract_id: address,
            });
          }
        }
        break;
      }
      case 'allowlist_only': {
        const allow = new Set(rule.allowlist ?? []);
        for (const address of observed) {
          if (!allow.has(address)) {
            violations.push({
              rule_type: rule.type,
              effect,
              message: rule.label ?? `Contract not on allowlist: ${address}`,
              contract_id: address,
            });
          }
        }
        break;
      }
      case 'admin_auth_path': {
        const adminHints = detectAdminAuthPaths(input.trace, input.manifest);
        for (const address of adminHints) {
          violations.push({
            rule_type: rule.type,
            effect,
            message: rule.label ?? `Admin / privileged auth path detected for ${address}`,
            contract_id: address,
          });
        }
        break;
      }
      case 'max_blast_radius': {
        const threshold = rule.threshold ?? 50;
        if (input.gravity.blast_radius >= threshold) {
          violations.push({
            rule_type: rule.type,
            effect,
            message: rule.label
              ?? `Blast radius ${input.gravity.blast_radius} exceeds threshold ${threshold}`,
          });
        }
        break;
      }
      case 'require_approval': {
        const threshold = rule.threshold ?? 40;
        if (input.gravity.blast_radius >= threshold) {
          violations.push({
            rule_type: rule.type,
            effect,
            message: rule.label
              ?? `Blast radius ${input.gravity.blast_radius} requires human approval (threshold ${threshold})`,
          });
        }
        break;
      }
      case 'max_slippage': {
        const slippageContracts = contractsWithSlippage(input.gravity);
        // threshold reserved for Phase B bps; Phase A fires on any slippage sensitivity.
        if (slippageContracts.length > 0) {
          for (const address of slippageContracts) {
            violations.push({
              rule_type: rule.type,
              effect,
              message: rule.label
                ?? (rule.threshold !== undefined
                  ? `Slippage-sensitive path on ${address} (bps threshold ${rule.threshold} reserved for decoded amounts)`
                  : `Slippage-sensitive swap/transfer path detected on ${address}`),
              contract_id: address,
            });
          }
        }
        break;
      }
      case 'max_amount': {
        const threshold = rule.threshold ?? Number.POSITIVE_INFINITY;
        for (const movement of tokenMovements) {
          const amount = parseAmountNumber(movement.amount);
          if (amount !== undefined && amount >= threshold) {
            violations.push({
              rule_type: rule.type,
              effect,
              message: rule.label
                ?? `Token movement amount ${movement.amount} exceeds max_amount threshold ${threshold}`,
              contract_id: movement.to ?? movement.from,
            });
          }
        }
        break;
      }
      case 'untrusted_counterparty': {
        for (const address of observed) {
          const contract = input.manifest?.contracts.find((c) => c.address === address);
          if (!contract) continue;
          const reasons: string[] = [];
          if (contract.audit_status === 'unaudited' || contract.audit_status === 'unknown') {
            reasons.push(`audit_status=${contract.audit_status}`);
          }
          if (contract.upgradeable) {
            reasons.push('upgradeable=true');
          }
          const reputationFloor = rule.threshold ?? 50;
          if (
            contract.reputation_score !== undefined
            && contract.reputation_score < reputationFloor
          ) {
            reasons.push(`reputation_score=${contract.reputation_score} < ${reputationFloor}`);
          }
          if (reasons.length > 0) {
            violations.push({
              rule_type: rule.type,
              effect,
              message: rule.label
                ?? `Untrusted counterparty ${address}: ${reasons.join(', ')}`,
              contract_id: address,
            });
          }
        }
        break;
      }
      case 'ttl_critical': {
        for (const warning of input.field.ttl_warnings.filter((w) => w.severity === 'CRITICAL')) {
          violations.push({
            rule_type: rule.type,
            effect,
            message: rule.label ?? `Critical TTL / archival risk on ${warning.contract_id}`,
            contract_id: warning.contract_id,
          });
        }
        break;
      }
      case 'upgrade_risk': {
        for (const upgrade of input.field.upgrade_warnings) {
          violations.push({
            rule_type: rule.type,
            effect,
            message: rule.label ?? `WASM upgrade risk on ${upgrade.contract_id}`,
            contract_id: upgrade.contract_id,
          });
        }
        break;
      }
      case 'min_confidence': {
        const min = rule.min_confidence ?? rule.threshold ?? 0.75;
        if (input.confidence < min) {
          violations.push({
            rule_type: rule.type,
            effect,
            message: rule.label
              ?? `Confidence ${input.confidence} is below minimum ${min}`,
          });
        }
        break;
      }
      default:
        break;
    }
  }

  const effect = aggregateEffect(violations);
  return {
    passed: effect === 'ALLOW',
    effect,
    violations,
    evaluated_rules: input.rules.length,
  };
}

function contractsWithSlippage(gravity: GravityResult): string[] {
  const hits = new Set<string>();
  for (const contract of gravity.affected_contracts) {
    const applied = contract.score_breakdown.factors.some(
      (factor) => factor.key === 'slippage_sensitivity' && factor.applied,
    );
    if (applied) hits.add(contract.address);
  }
  return [...hits];
}

export function parseAmountNumber(amount?: string): number | undefined {
  if (!amount) return undefined;
  const cleaned = amount.replace(/,/g, '').trim();
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function detectAdminAuthPaths(
  trace: TraceResult,
  manifest?: EcosystemManifest,
): string[] {
  const hits = new Set<string>();
  const adminRoles = new Set(['admin', 'governance', 'owner', 'upgrader', 'core']);

  for (const entry of trace.auth_entries) {
    const address = entry.contract_id ?? entry.address;
    if (!address) continue;
    const role = manifest?.contracts.find((c) => c.address === address)?.role?.toLowerCase();
    const creds = entry.credentials.join(' ').toLowerCase();
    if (
      (role && adminRoles.has(role))
      || creds.includes('admin')
      || creds.includes('upgrade')
      || creds.includes('owner')
    ) {
      hits.add(address);
    }
  }

  for (const step of trace.execution_path) {
    const fn = step.function_name?.toLowerCase() ?? '';
    if (
      step.contract_id
      && (fn.includes('upgrade') || fn.includes('admin') || fn.includes('set_admin') || fn.includes('clawback'))
    ) {
      hits.add(step.contract_id);
    }
  }

  return [...hits];
}

function aggregateEffect(violations: PolicyViolation[]): PolicyEffect {
  if (violations.some((v) => v.effect === 'ABORT')) return 'ABORT';
  if (violations.some((v) => v.effect === 'WARN')) return 'WARN';
  return 'ALLOW';
}
