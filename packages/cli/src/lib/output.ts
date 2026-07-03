import pc from 'picocolors';
import type {
  AnalyzeResponse,
  FieldResult,
  GravityResult,
  TraceResult,
  Verdict,
} from '@meridian/core';

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
  console.log('');
}
