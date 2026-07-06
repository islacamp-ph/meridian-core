import pc from 'picocolors';
import type {
  AnalyzeResponse,
  BatchAnalyzeResponse,
  FieldResult,
  GravityResult,
  TraceResult,
  Verdict,
} from '../internal/meridian-core.js';

/**
 * Print any value as pretty-printed JSON.
 *
 * @param value - Value to serialize
 */
export function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

/**
 * Colorize a verdict badge.
 *
 * @param verdict - MERIDIAN verdict
 * @returns Colorized verdict string
 */
function verdictBadge(verdict: Verdict): string {
  switch (verdict) {
    case 'CLEAR':
      return pc.bgGreen(pc.black(' CLEAR '));
    case 'WARN':
      return pc.bgYellow(pc.black(' WARN '));
    case 'ABORT':
      return pc.bgRed(pc.white(pc.bold(' ABORT ')));
    default:
      return verdict;
  }
}

/**
 * Print a section header.
 *
 * @param title - Section title
 */
function section(title: string): void {
  console.log('');
  console.log(pc.bold(pc.cyan(`── ${title} `.padEnd(48, '─'))));
}

/**
 * Print a labeled key/value line.
 *
 * @param label - Field label
 * @param value - Field value
 */
function field(label: string, value: unknown): void {
  console.log(`  ${pc.dim(label + ':')} ${value}`);
}

/**
 * Print a TraceResult in human-readable form.
 *
 * @param trace - TRACE layer result
 */
export function printTrace(trace: TraceResult): void {
  section('TRACE');
  field('success', trace.success ? pc.green('true') : pc.red('false'));
  field('simulation_ledger', trace.simulation_context.ledgerSequence);
  field('latest_ledger', trace.simulation_context.latestLedger);
  if (trace.staleness_warning) {
    field('staleness_warning', pc.yellow('true'));
  }
  if (trace.failure_point) {
    const fp = trace.failure_point;
    console.log(`  ${pc.red('failure_point')}:`);
    field('  step_index', fp.step_index);
    if (fp.contract_id) field('  contract_id', fp.contract_id);
    if (fp.function_name) field('  function_name', fp.function_name);
    field('  error_code', fp.error_code);
    field('  root_cause', fp.root_cause);
  }
  field('execution_path', `${trace.execution_path.length} step(s)`);
  field('auth_entries', `${trace.auth_entries.length} entrie(s)`);
  field(
    'fee_estimate',
    `total=${trace.fee_estimate.total_fee} base=${trace.fee_estimate.classic_base_fee} min_resource=${trace.fee_estimate.min_resource_fee}`,
  );
  field(
    'resource_usage',
    `cpu=${trace.resource_usage.cpu_instructions} mem=${trace.resource_usage.memory_bytes}b read=${trace.resource_usage.read_bytes}b write=${trace.resource_usage.write_bytes}b`,
  );
}

/**
 * Print a FieldResult in human-readable form.
 *
 * @param result - FIELD layer result
 */
export function printField(result: FieldResult): void {
  section('FIELD');
  field('contracts_mapped', result.contracts_mapped);
  field('manifest_coverage', `${Math.round(result.manifest_coverage * 100)}%`);
  if (result.ttl_warnings.length > 0) {
    console.log(`  ${pc.yellow('ttl_warnings')}:`);
    for (const warning of result.ttl_warnings) {
      console.log(
        `    - ${warning.contract_id} (${warning.ledger_key}) ttl_remaining=${warning.ttl_remaining} [${warning.severity}]`,
      );
    }
  }
  if (result.dependency_graph.length > 0) {
    console.log(`  ${pc.dim('dependency_graph')}:`);
    for (const node of result.dependency_graph) {
      const label = node.name ? `${node.name} (${node.address})` : node.address;
      const deps = node.dependencies.length > 0 ? ` → ${node.dependencies.join(', ')}` : '';
      console.log(`    - ${label}${deps}`);
    }
  }
}

/**
 * Print a GravityResult in human-readable form.
 *
 * @param result - GRAVITY layer result
 */
export function printGravity(result: GravityResult): void {
  section('GRAVITY');
  field('blast_radius', result.blast_radius);
  field('total_affected_users', result.total_affected_users);
  field('recovery', result.recovery);
  field('score_formula', result.score_breakdown.formula);
  field('weighted_score', result.score_breakdown.total_weighted_score);
  if (result.critical.length > 0) field('critical', pc.red(result.critical.join(', ')));
  if (result.warning.length > 0) field('warning', pc.yellow(result.warning.join(', ')));
  if (result.monitor.length > 0) field('monitor', pc.blue(result.monitor.join(', ')));
  if (result.safe.length > 0) field('safe', pc.green(result.safe.join(', ')));

  if (result.affected_contracts.length > 0) {
    console.log(`  ${pc.dim('affected_contracts')}:`);
    for (const contract of result.affected_contracts) {
      const label = contract.name ? `${contract.name} (${contract.address})` : contract.address;
      console.log(`    - [${contract.impact}] ${label} — ${contract.reason}`);
    }
  }
}

/**
 * Print a full AnalyzeResponse in human-readable form.
 *
 * @param response - Full analysis response including brief
 */
export function printAnalysis(response: AnalyzeResponse): void {
  console.log('');
  console.log(`${pc.bold('MERIDIAN')} v${response.version}  ${verdictBadge(response.verdict)}  confidence=${response.confidence}`);

  printTrace(response.trace);
  printField(response.field);
  printGravity(response.gravity);

  section('EXPLAINABILITY');
  field('operations', response.explainability.operations.length);
  field('contracts', response.explainability.contracts.length);
  console.log(`  ${pc.dim('operations')}:`);
  for (const operation of response.explainability.operations) {
    const touched = operation.touched_contracts.length > 0
      ? operation.touched_contracts
          .map((contract) => {
            const impact = contract.impact ? ` [${contract.impact}]` : '';
            const sources = contract.sources.length > 0 ? ` {${contract.sources.join(', ')}}` : '';
            return `${contract.address}${impact}${sources}`;
          })
          .join(', ')
      : 'none';
    console.log(`    - step ${operation.index} ${operation.type}: ${operation.description} -> ${touched}`);
  }
  console.log(`  ${pc.dim('contracts')}:`);
  for (const contract of response.explainability.contracts) {
    const label = contract.name ? `${contract.name} (${contract.address})` : contract.address;
    const impact = contract.impact ? ` [${contract.impact}]` : '';
    const reason = contract.impact_reason ? ` — ${contract.impact_reason}` : '';
    console.log(`    - ${label}${impact} sources={${contract.sources.join(', ') || 'none'}} ops=[${contract.touched_by_operations.join(', ')}]${reason}`);
  }
  console.log(`  ${pc.dim('blast_radius')}: ${response.explainability.blast_radius.formula}`);
  for (const contribution of response.explainability.blast_radius.contributions) {
    const label = contribution.name ? `${contribution.name} (${contribution.address})` : contribution.address;
    const factors = contribution.factors.map((factor) => `${factor.key}=${factor.weight}`).join(', ');
    console.log(
      `    - ${label} [${contribution.impact}] score=${contribution.contract_score} contribution=${contribution.normalized_contribution} — ${contribution.reason}${factors ? ` {${factors}}` : ''}`,
    );
  }

  if (response.fix_sequence && response.fix_sequence.length > 0) {
    section('FIX SEQUENCE');
    for (const step of response.fix_sequence) {
      console.log(
        `  ${pc.bold(String(step.order) + '.')} ${step.operation} — ${step.description} ${pc.dim(`(~${step.estimated_cost_stroops} stroops, ~${step.estimated_time_minutes}min)`)}`,
      );
    }
  }

  if (response.warnings && response.warnings.length > 0) {
    section('WARNINGS');
    for (const warning of response.warnings) {
      console.log(`  ${pc.yellow('⚠')} ${warning}`);
    }
  }

  section('BRIEF');
  console.log(response.brief);

  section('META');
  field('analyzed_at', response.meta.analyzed_at);
  field('network', response.meta.network);
  field('ledger_sequence', response.meta.ledger_sequence);
  field('simulation_stale', response.meta.simulation_stale);
  field('processing_ms', response.meta.processing_ms);
  field(
    'layer_timings_ms',
    `trace=${response.meta.layer_timings_ms.trace} field=${response.meta.layer_timings_ms.field} gravity=${response.meta.layer_timings_ms.gravity}${response.meta.layer_timings_ms.brief !== undefined ? ` brief=${response.meta.layer_timings_ms.brief}` : ''}`,
  );
  field('unmapped_contracts', response.meta.unmapped_contracts);
  field('confidence_bucket', response.meta.confidence_bucket);
  console.log('');
}

export function printBatchAnalysis(response: BatchAnalyzeResponse): void {
  console.log('');
  console.log(`${pc.bold('MERIDIAN')} v${response.version}  ${pc.bgMagenta(pc.white(' BATCH '))}`);

  section('SUMMARY');
  field('total', response.summary.total);
  field('ok', response.summary.ok);
  field('errors', response.summary.errors);
  field('clear', response.summary.clear);
  field('warn', response.summary.warn);
  field('abort', response.summary.abort);
  field('stale', response.summary.stale);
  field('average_confidence', response.summary.average_confidence);

  if (response.summary.highest_risk_transaction) {
    const highestRisk = response.summary.highest_risk_transaction;
    section('HIGHEST RISK');
    field('id', highestRisk.id);
    field('network', highestRisk.network);
    field('status', highestRisk.status);
    field('risk_score', highestRisk.risk_score);
    if (highestRisk.verdict) field('verdict', highestRisk.verdict);
    if (highestRisk.blast_radius !== undefined) field('blast_radius', highestRisk.blast_radius);
    if (highestRisk.error_code) field('error_code', highestRisk.error_code);
  }

  if (response.summary.common_failure_patterns.length > 0) {
    section('COMMON FAILURE PATTERNS');
    for (const pattern of response.summary.common_failure_patterns) {
      console.log(
        `  - ${pattern.error_code} (${pattern.count}) — ${pattern.root_cause} ${pc.dim(`[${pattern.item_ids.join(', ')}]`)}`,
      );
    }
  }

  section('ITEMS');
  for (const item of response.items) {
    if (item.status === 'error') {
      console.log(`  - ${pc.red(item.id)} [ERROR] risk=${item.risk_score} network=${item.network} code=${item.error?.code}`);
      continue;
    }

    console.log(
      `  - ${pc.bold(item.id)} [${item.result?.verdict}] risk=${item.risk_score} network=${item.network} confidence=${item.result?.confidence} blast=${item.result?.gravity.blast_radius}`,
    );
  }

  console.log('');
}
