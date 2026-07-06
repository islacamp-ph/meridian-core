/**
 * MERIDIAN core type definitions.
 * Shared across TRACE, FIELD, GRAVITY, and API layers.
 */

export type Network = 'mainnet' | 'testnet';

export type Verdict = 'CLEAR' | 'WARN' | 'ABORT';

export type RecoveryLevel = 'FULL' | 'PARTIAL' | 'NONE';

export type Criticality = 'HIGH' | 'MEDIUM' | 'LOW';

export type ImpactLevel = 'CRITICAL' | 'WARNING' | 'SAFE' | 'MONITOR';

export type MeridianLayer = 'TRACE' | 'FIELD' | 'GRAVITY' | 'BRIEF';

export interface AnalyzeRequest {
  tx: string;
  network: Network;
  ecosystem?: EcosystemManifest;
  options?: AnalyzeOptions;
}

export interface AnalyzeOptions {
  skip_field?: boolean;
  skip_gravity?: boolean;
  confidence_threshold?: number;
  rpc_url?: string;
}

export interface AnalyzeResponse {
  product: 'MERIDIAN';
  version: string;
  verdict: Verdict;
  confidence: number;
  trace: TraceResult;
  field: FieldResult;
  gravity: GravityResult;
  explainability: ExplainabilityReport;
  brief: string;
  fix_sequence?: FixStep[];
  warnings?: string[];
  meta: ResponseMeta;
}

export type StructuredAnalyzeResponse = Omit<AnalyzeResponse, 'brief'>;

export interface TraceResult {
  success: boolean;
  failure_point?: FailurePoint;
  execution_path: ExecutionStep[];
  auth_entries: AuthEntry[];
  fee_estimate: FeeEstimate;
  resource_usage: ResourceUsage;
  simulation_context: SimulationContext;
  staleness_warning?: boolean;
}

export interface FailurePoint {
  step_index: number;
  contract_id?: string;
  function_name?: string;
  error_code: string;
  error_message: string;
  root_cause: string;
}

export interface ExecutionStep {
  index: number;
  type: 'invoke' | 'read' | 'write' | 'auth' | 'classic';
  contract_id?: string;
  function_name?: string;
  description: string;
  ledger_keys?: string[];
}

export interface AuthEntry {
  address: string;
  contract_id?: string;
  credentials: string[];
}

export interface FeeEstimate {
  classic_base_fee: number;
  min_resource_fee: number;
  total_fee: number;
}

export interface ResourceUsage {
  cpu_instructions: number;
  memory_bytes: number;
  read_bytes: number;
  write_bytes: number;
}

export interface FieldResult {
  contracts_mapped: number;
  dependency_graph: DependencyNode[];
  ttl_warnings: TTLWarning[];
  manifest_coverage: number;
}

export interface DependencyNode {
  address: string;
  name?: string;
  dependencies: string[];
  depth: number;
}

export interface TTLWarning {
  contract_id: string;
  ledger_key: string;
  ttl_remaining: number;
  severity: 'WARNING' | 'CRITICAL';
}

export interface GravityResult {
  blast_radius: number;
  score_breakdown: GravityScoreBreakdown;
  affected_contracts: ContractImpact[];
  critical: string[];
  warning: string[];
  safe: string[];
  monitor: string[];
  total_affected_users: number;
  recovery: RecoveryLevel;
}

export interface ContractImpact {
  address: string;
  name?: string;
  impact: ImpactLevel;
  active_users?: number;
  score: number;
  reason: string;
  score_breakdown: GravityContractScoreBreakdown;
}

export interface GravityFactor {
  key:
    | 'direct_failure_point'
    | 'direct_touch'
    | 'write_access'
    | 'read_access'
    | 'auth_critical_path'
    | 'manifest_criticality'
    | 'active_users'
    | 'direct_dependency'
    | 'transitive_dependency'
    | 'contract_role';
  label: string;
  weight: number;
  applied: boolean;
  reason: string;
}

export interface GravityContractScoreBreakdown {
  total: number;
  factors: GravityFactor[];
}

export interface GravityScoreContribution {
  address: string;
  name?: string;
  impact: ImpactLevel;
  contract_score: number;
  normalized_contribution: number;
  reason: string;
  active_users?: number;
  factors: GravityFactor[];
}

export interface GravityScoreBreakdown {
  formula: string;
  total_contracts: number;
  total_weighted_score: number;
  normalized_score: number;
  contributions: GravityScoreContribution[];
}

export type ExplainabilityContractSource = 'execution_path' | 'footprint' | 'manifest';

export interface ExplainabilityReport {
  operations: ExplainabilityOperationNode[];
  contracts: ExplainabilityContractNode[];
  blast_radius: BlastRadiusExplanation;
}

export interface ExplainabilityOperationNode {
  index: number;
  type: ExecutionStep['type'];
  description: string;
  contract_id?: string;
  function_name?: string;
  touched_contracts: ExplainabilityTouchedContract[];
}

export interface ExplainabilityTouchedContract {
  address: string;
  sources: ExplainabilityContractSource[];
  impact?: ImpactLevel;
  impact_reason?: string;
}

export interface ExplainabilityContractNode {
  address: string;
  name?: string;
  sources: ExplainabilityContractSource[];
  from_execution_path: boolean;
  from_footprint: boolean;
  from_manifest: boolean;
  touched_by_operations: number[];
  dependencies: string[];
  impact?: ImpactLevel;
  impact_reason?: string;
  active_users?: number;
  criticality?: Criticality;
}

export interface BlastRadiusExplanation {
  formula: string;
  total_contracts: number;
  total_weighted_score: number;
  normalized_score: number;
  contributions: BlastRadiusContribution[];
}

export interface BlastRadiusContribution {
  address: string;
  name?: string;
  impact: ImpactLevel;
  contract_score: number;
  normalized_contribution: number;
  reason: string;
  active_users?: number;
  factors: GravityFactor[];
}

export interface FixStep {
  order: number;
  operation: string;
  description: string;
  estimated_cost_stroops: number;
  estimated_time_minutes: number;
}

export interface EcosystemManifest {
  name: string;
  version: string;
  contracts: ManifestContract[];
}

export interface ManifestContract {
  name: string;
  address: string;
  network: Network;
  dependencies?: string[];
  active_users?: number;
  criticality?: Criticality;
  role?: string;
}

export interface ResponseMeta {
  analyzed_at: string;
  ledger_sequence: number;
  simulation_stale: boolean;
  network: Network;
  processing_ms: number;
}

export interface MeridianError {
  error: string;
  code: string;
  hint: string;
  layer: MeridianLayer;
}

export interface TraceOptions {
  network: Network;
  rpcUrl: string;
  timeoutMs?: number;
}

export interface FieldOptions {
  network: Network;
  manifest?: EcosystemManifest;
}

export interface GravityOptions {
  manifest?: EcosystemManifest;
}

export interface SimulationContext {
  ledgerSequence: number;
  latestLedger: number;
  footprintContracts: string[];
  readOnly: string[];
  readWrite: string[];
}

export interface BatchAnalyzeItemRequest extends AnalyzeRequest {
  id?: string;
}

export interface BatchAnalyzeItemResult {
  id: string;
  network: Network;
  status: 'ok' | 'error';
  risk_score: number;
  result?: StructuredAnalyzeResponse;
  error?: MeridianError;
}

export interface BatchFailurePattern {
  error_code: string;
  root_cause: string;
  count: number;
  item_ids: string[];
}

export interface HighestRiskTransaction {
  id: string;
  network: Network;
  status: 'ok' | 'error';
  risk_score: number;
  verdict?: Verdict;
  blast_radius?: number;
  error_code?: string;
}

export interface BatchSummary {
  total: number;
  ok: number;
  errors: number;
  clear: number;
  warn: number;
  abort: number;
  stale: number;
  average_confidence: number;
  highest_risk_transaction?: HighestRiskTransaction;
  common_failure_patterns: BatchFailurePattern[];
}

export interface BatchAnalyzeResponse {
  product: 'MERIDIAN';
  version: string;
  items: BatchAnalyzeItemResult[];
  summary: BatchSummary;
}
