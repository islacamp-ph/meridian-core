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
  brief: string;
  fix_sequence?: FixStep[];
  warnings?: string[];
  meta: ResponseMeta;
}

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
  reason: string;
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
