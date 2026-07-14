/**
 * MERIDIAN core type definitions.
 * Shared across TRACE, FIELD, GRAVITY, and API layers.
 */

export type Network = 'mainnet' | 'testnet';

export type SimulationAuthMode = 'enforce' | 'record' | 'record_allow_nonroot';

export type Verdict = 'CLEAR' | 'WARN' | 'ABORT';

/** Pre-submit decision: should this transaction be sent right now? */
export type DecisionAction = 'submit' | 'hold' | 'rewrite';

export type ConfidenceBucket = 'LOW' | 'MEDIUM' | 'HIGH';

export type RiskSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type ExecutionGraphEdgeType =
  | 'invoke'
  | 'downstream'
  | 'auth'
  | 'read'
  | 'write'
  | 'token';

export type PolicyRuleType =
  | 'unknown_contract'
  | 'admin_auth_path'
  | 'max_blast_radius'
  | 'allowlist_only'
  | 'ttl_critical'
  | 'upgrade_risk'
  | 'min_confidence';

export type PolicyEffect = 'ABORT' | 'WARN' | 'ALLOW';

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
  /** Soroban simulation auth mode for TRACE (default: enforce). */
  auth_mode?: SimulationAuthMode;
  /** Auth mode for FIELD deep dependency discovery (default: record). */
  field_auth_mode?: SimulationAuthMode;
  /** When true, FIELD uses record_allow_nonroot for deep ecosystem mapping. */
  deep_discovery?: boolean;
  /** Optional deterministic policy rules evaluated after analysis. */
  policy_rules?: PolicyRule[];
}

export interface AnalyzeResponse {
  product: 'MERIDIAN';
  version: string;
  verdict: Verdict;
  confidence: number;
  /** Pre-submit decision: submit | hold | rewrite with top risks. */
  decision: Decision;
  /** First-class execution / dependency / state / auth graph. */
  execution_graph: ExecutionGraph;
  /** Ledger state surfaces this tx intends to touch. */
  state_changes: StateChangeSummary;
  /** Top risks (also mirrored on decision.top_risks). */
  top_risks: RiskItem[];
  trace: TraceResult;
  field: FieldResult;
  gravity: GravityResult;
  explainability: ExplainabilityReport;
  brief: string;
  fix_sequence?: FixStep[];
  warnings?: string[];
  /** Optional policy evaluation when rules are provided on the request. */
  policy?: PolicyResult;
  meta: ResponseMeta;
}

export interface Decision {
  action: DecisionAction;
  reason: string;
  confidence: number;
  top_risks: RiskItem[];
}

export interface RiskItem {
  id: string;
  severity: RiskSeverity;
  title: string;
  why_it_matters: string;
  contract_id?: string;
  factor_key?: string;
}

export interface ExecutionGraphNode {
  id: string;
  kind: 'contract' | 'account' | 'asset' | 'ledger_key';
  label: string;
  address?: string;
  depth?: number;
  source?: DependencyNodeSource;
  upgrade_risk?: boolean;
}

export interface ExecutionGraphEdge {
  from: string;
  to: string;
  type: ExecutionGraphEdgeType;
  label?: string;
  step_index?: number;
}

export interface ExecutionGraph {
  nodes: ExecutionGraphNode[];
  edges: ExecutionGraphEdge[];
  root_contracts: string[];
  downstream_contracts: string[];
  auth_dependencies: string[];
  state_surfaces: {
    read: string[];
    write: string[];
  };
  token_movements: TokenMovement[];
}

export interface TokenMovement {
  from?: string;
  to?: string;
  asset?: string;
  amount?: string;
  step_index?: number;
  description: string;
}

export interface StateChangeSummary {
  summary: string;
  reads: StateSurface[];
  writes: StateSurface[];
  irreversible_writes: number;
  contracts_read: string[];
  contracts_written: string[];
}

export interface StateSurface {
  ledger_key: string;
  contract_id?: string;
  access: 'read' | 'write';
  description: string;
}

export interface PolicyRule {
  type: PolicyRuleType;
  /** Effect when the rule matches. Defaults: unknown_contract/allowlist/ttl/max_blast → ABORT, others → WARN. */
  effect?: PolicyEffect;
  /** For max_blast_radius: fail/warn when blast_radius >= threshold. */
  threshold?: number;
  /** For allowlist_only: list of permitted contract addresses. */
  allowlist?: string[];
  /** For min_confidence: warn/fail when confidence < threshold. */
  min_confidence?: number;
  /** Optional human label. */
  label?: string;
}

export interface PolicyViolation {
  rule_type: PolicyRuleType;
  effect: PolicyEffect;
  message: string;
  contract_id?: string;
}

export interface PolicyResult {
  passed: boolean;
  effect: PolicyEffect;
  violations: PolicyViolation[];
  evaluated_rules: number;
}

export interface AnalyzeDiffRequest {
  tx_a: string;
  tx_b: string;
  network: Network;
  ecosystem?: EcosystemManifest;
  options?: AnalyzeOptions;
}

export interface AnalyzeDiffResponse {
  product: 'MERIDIAN';
  version: string;
  a: StructuredAnalyzeResponse;
  b: StructuredAnalyzeResponse;
  diff: ExecutionDiff;
}

export interface ExecutionDiff {
  summary: string;
  verdict_changed: boolean;
  decision_changed: boolean;
  blast_radius_delta: number;
  contracts_added: string[];
  contracts_removed: string[];
  auth_added: string[];
  auth_removed: string[];
  writes_added: string[];
  writes_removed: string[];
  risks_added: RiskItem[];
  risks_removed: RiskItem[];
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
  rpc_metrics?: RpcMetrics;
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
  upgrade_warnings: UpgradeWarning[];
}

export type DependencyNodeSource =
  | 'footprint'
  | 'execution_path'
  | 'manifest'
  | 'record_discovery';

export interface DependencyNode {
  address: string;
  name?: string;
  dependencies: string[];
  depth: number;
  source?: DependencyNodeSource;
  wasm_hash?: string;
  wasm_hash_expected?: string;
  upgrade_risk?: boolean;
}

export interface UpgradeWarning {
  contract_id: string;
  name?: string;
  expected_wasm_hash: string;
  on_chain_wasm_hash: string;
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
    | 'contract_role'
    | 'fund_exposure'
    | 'privilege_level'
    | 'irreversible_write'
    | 'unknown_dependency'
    | 'upgradeable_dependency'
    | 'ttl_archival'
    | 'slippage_sensitivity';
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
  manifest_inferred?: boolean;
  touched_by_operations: number[];
  dependencies: string[];
  impact?: ImpactLevel;
  impact_reason?: string;
  active_users?: number;
  criticality?: Criticality;
  upgrade_risk?: boolean;
  wasm_hash?: string;
  wasm_hash_expected?: string;
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
  /** Risk / failure factor this remediation targets. */
  targets?: string[];
  contract_id?: string;
  /** Safer rewrite guidance when action is rewrite. */
  safer_alternative?: string;
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
  /** Expected on-chain WASM hash (hex) for upgrade-risk detection. */
  expected_wasm_hash?: string;
}

export interface LayerTimingMetrics {
  trace: number;
  field: number;
  gravity: number;
  brief?: number;
}

export interface RpcMetrics {
  simulate_transaction_ms: number;
  get_latest_ledger_ms: number;
  latest_ledger_fallback: boolean;
  latest_ledger_timed_out: boolean;
  timeout_ms: number;
}

export interface ResponseMeta {
  analyzed_at: string;
  ledger_sequence: number;
  simulation_stale: boolean;
  network: Network;
  processing_ms: number;
  layer_timings_ms: LayerTimingMetrics;
  unmapped_contracts: number;
  confidence_bucket: ConfidenceBucket;
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
  authMode?: SimulationAuthMode;
}

export interface FieldOptions {
  network: Network;
  manifest?: EcosystemManifest;
  rpcUrl?: string;
  timeoutMs?: number;
  authMode?: SimulationAuthMode;
  deepDiscovery?: boolean;
  /** Original transaction XDR, required for record-mode dependency discovery. */
  txXdr?: string;
}

export interface LedgerEntryTTL {
  ledger_key: string;
  live_until_ledger_seq?: number;
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
