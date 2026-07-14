import type { AnalyzeDiffRequest, AnalyzeRequest, Network, PolicyRule } from '@meridian/core';

export interface BatchAnalyzeRequestBody {
  items: Array<{
    id?: string;
    tx: string;
    network?: Network;
    ecosystem?: AnalyzeRequest['ecosystem'];
    options?: AnalyzeRequest['options'];
  }>;
  default_network?: Network;
  ecosystem?: AnalyzeRequest['ecosystem'];
  options?: AnalyzeRequest['options'];
}

export interface TraceRequestBody {
  tx: string;
  network: Network;
}

export interface FieldRequestBody extends TraceRequestBody {
  ecosystem?: AnalyzeRequest['ecosystem'];
}

export type GravityRequestBody = FieldRequestBody;

export type AnalyzeDiffRequestBody = AnalyzeDiffRequest;

const POLICY_RULE_TYPES = [
  'unknown_contract',
  'admin_auth_path',
  'max_blast_radius',
  'allowlist_only',
  'ttl_critical',
  'upgrade_risk',
  'min_confidence',
] as const;

const POLICY_EFFECTS = ['ABORT', 'WARN', 'ALLOW'] as const;

export interface ValidationFailure {
  message: string;
  hint: string;
  details: string[];
}

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: ValidationFailure };

export function parseAnalyzeRequest(value: unknown): ValidationResult<AnalyzeRequest> {
  if (!isRecord(value)) {
    return invalid('Invalid JSON request body', 'Send an object with tx (base64 XDR) and network fields.', ['Request body must be a JSON object.']);
  }

  const details: string[] = [];
  const tx = readRequiredString(value.tx, 'tx', details);
  const network = readNetwork(value.network, 'network', details);
  const ecosystem = readManifest(value.ecosystem, 'ecosystem', details);
  const options = readAnalyzeOptions(value.options, 'options', details);

  if (details.length > 0 || !tx || !network) {
    return invalid('Invalid analyze request body', 'Provide tx (base64 XDR string) and network (mainnet | testnet).', details);
  }

  return success({ tx, network, ecosystem, options });
}

export function parseBatchAnalyzeRequest(value: unknown): ValidationResult<BatchAnalyzeRequestBody> {
  if (!isRecord(value)) {
    return invalid('Invalid JSON request body', 'Send an object with a non-empty items array.', ['Request body must be a JSON object.']);
  }

  const details: string[] = [];
  const defaultNetwork = readOptionalNetwork(value.default_network, 'default_network', details);
  const ecosystem = readManifest(value.ecosystem, 'ecosystem', details);
  const options = readAnalyzeOptions(value.options, 'options', details);

  if (!Array.isArray(value.items) || value.items.length === 0) {
    details.push('items must be a non-empty array.');
    return invalid('Invalid batch analyze request body', 'Provide a non-empty items array.', details);
  }

  const items = value.items.map((item, index) => normalizeBatchItem(item, index, defaultNetwork, details));

  if (details.length > 0 || items.some((item) => item === null)) {
    return invalid(
      'Invalid batch analyze request body',
      'Each item must include tx and either item.network or default_network.',
      details,
    );
  }

  return success({
    items: items.filter((item): item is BatchAnalyzeRequestBody['items'][number] => item !== null),
    default_network: defaultNetwork,
    ecosystem,
    options,
  });
}

export function parseTraceRequest(value: unknown): ValidationResult<TraceRequestBody> {
  return parseTxAndNetworkRequest(value, 'trace');
}

export function parseFieldRequest(value: unknown): ValidationResult<FieldRequestBody> {
  return parseTxAndNetworkWithManifestRequest(value, 'field');
}

export function parseGravityRequest(value: unknown): ValidationResult<GravityRequestBody> {
  return parseTxAndNetworkWithManifestRequest(value, 'gravity');
}

export function parseAnalyzeDiffRequest(value: unknown): ValidationResult<AnalyzeDiffRequestBody> {
  if (!isRecord(value)) {
    return invalid(
      'Invalid JSON request body',
      'Send an object with tx_a, tx_b (base64 XDR) and network fields.',
      ['Request body must be a JSON object.'],
    );
  }

  const details: string[] = [];
  const txA = readRequiredString(value.tx_a, 'tx_a', details);
  const txB = readRequiredString(value.tx_b, 'tx_b', details);
  const network = readNetwork(value.network, 'network', details);
  const ecosystem = readManifest(value.ecosystem, 'ecosystem', details);
  const options = readAnalyzeOptions(value.options, 'options', details);

  if (details.length > 0 || !txA || !txB || !network) {
    return invalid(
      'Invalid analyze diff request body',
      'Provide tx_a and tx_b (base64 XDR strings) and network (mainnet | testnet).',
      details,
    );
  }

  return success({ tx_a: txA, tx_b: txB, network, ecosystem, options });
}

function parseTxAndNetworkRequest(value: unknown, route: string): ValidationResult<TraceRequestBody> {
  if (!isRecord(value)) {
    return invalid(`Invalid ${route} request body`, 'Send an object with tx and network.', ['Request body must be a JSON object.']);
  }

  const details: string[] = [];
  const tx = readRequiredString(value.tx, 'tx', details);
  const network = readNetwork(value.network, 'network', details);

  if (details.length > 0 || !tx || !network) {
    return invalid(`Invalid ${route} request body`, 'Provide tx and network.', details);
  }

  return success({ tx, network });
}

function parseTxAndNetworkWithManifestRequest(
  value: unknown,
  route: string,
): ValidationResult<FieldRequestBody> {
  const base = parseTxAndNetworkRequest(value, route);
  if (!base.success) return base;

  const details: string[] = [];
  const ecosystem = isRecord(value) ? readManifest(value.ecosystem, 'ecosystem', details) : undefined;
  if (details.length > 0) {
    return invalid(`Invalid ${route} request body`, 'Provide a valid ecosystem manifest if supplied.', details);
  }

  return success({ ...base.data, ecosystem });
}

function normalizeBatchItem(
  value: unknown,
  index: number,
  defaultNetwork: Network | undefined,
  details: string[],
): BatchAnalyzeRequestBody['items'][number] | null {
  if (!isRecord(value)) {
    details.push(`items[${index}] must be an object.`);
    return null;
  }

  const tx = readRequiredString(value.tx, `items[${index}].tx`, details);
  const network = readOptionalNetwork(value.network, `items[${index}].network`, details) ?? defaultNetwork;
  if (!network) {
    details.push(`items[${index}] must include network or default_network must be provided.`);
    return null;
  }

  const ecosystem = readManifest(value.ecosystem, `items[${index}].ecosystem`, details);
  const options = readAnalyzeOptions(value.options, `items[${index}].options`, details);
  const id = readOptionalString(value.id, `items[${index}].id`, details);

  if (!tx) return null;

  return { id, tx, network, ecosystem, options };
}

function readAnalyzeOptions(
  value: unknown,
  path: string,
  details: string[],
): AnalyzeRequest['options'] | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    details.push(`${path} must be an object.`);
    return undefined;
  }

  const result: NonNullable<AnalyzeRequest['options']> = {};

  if (value.skip_field !== undefined) {
    if (typeof value.skip_field !== 'boolean') details.push(`${path}.skip_field must be a boolean.`);
    else result.skip_field = value.skip_field;
  }

  if (value.skip_gravity !== undefined) {
    if (typeof value.skip_gravity !== 'boolean') details.push(`${path}.skip_gravity must be a boolean.`);
    else result.skip_gravity = value.skip_gravity;
  }

  if (value.confidence_threshold !== undefined) {
    if (typeof value.confidence_threshold !== 'number' || Number.isNaN(value.confidence_threshold) || value.confidence_threshold < 0 || value.confidence_threshold > 1) {
      details.push(`${path}.confidence_threshold must be a number between 0 and 1.`);
    } else {
      result.confidence_threshold = value.confidence_threshold;
    }
  }

  if (value.rpc_url !== undefined) {
    if (typeof value.rpc_url !== 'string' || value.rpc_url.trim().length === 0) details.push(`${path}.rpc_url must be a non-empty string.`);
    else result.rpc_url = value.rpc_url.trim();
  }

  const authMode = readOptionalEnum(
    value.auth_mode,
    `${path}.auth_mode`,
    ['enforce', 'record', 'record_allow_nonroot'],
    details,
  );
  if (authMode) result.auth_mode = authMode;

  const fieldAuthMode = readOptionalEnum(
    value.field_auth_mode,
    `${path}.field_auth_mode`,
    ['enforce', 'record', 'record_allow_nonroot'],
    details,
  );
  if (fieldAuthMode) result.field_auth_mode = fieldAuthMode;

  if (value.deep_discovery !== undefined) {
    if (typeof value.deep_discovery !== 'boolean') details.push(`${path}.deep_discovery must be a boolean.`);
    else result.deep_discovery = value.deep_discovery;
  }

  if (value.policy_rules !== undefined) {
    const rules = readPolicyRules(value.policy_rules, `${path}.policy_rules`, details);
    if (rules) result.policy_rules = rules;
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function readPolicyRules(
  value: unknown,
  path: string,
  details: string[],
): PolicyRule[] | undefined {
  if (!Array.isArray(value)) {
    details.push(`${path} must be an array.`);
    return undefined;
  }

  const rules = value
    .map((rule, index) => readPolicyRule(rule, `${path}[${index}]`, details))
    .filter((rule): rule is PolicyRule => rule !== null);

  return rules.length > 0 ? rules : undefined;
}

function readPolicyRule(
  value: unknown,
  path: string,
  details: string[],
): PolicyRule | null {
  if (!isRecord(value)) {
    details.push(`${path} must be an object.`);
    return null;
  }

  const type = readOptionalEnum(value.type, `${path}.type`, POLICY_RULE_TYPES, details);
  if (!type) {
    if (value.type === undefined) details.push(`${path}.type is required.`);
    return null;
  }

  const effect = readOptionalEnum(value.effect, `${path}.effect`, POLICY_EFFECTS, details);
  const allowlist = readOptionalStringArray(value.allowlist, `${path}.allowlist`, details);
  const label = readOptionalString(value.label, `${path}.label`, details);

  let threshold: number | undefined;
  if (value.threshold !== undefined) {
    if (typeof value.threshold !== 'number' || Number.isNaN(value.threshold) || value.threshold < 0) {
      details.push(`${path}.threshold must be a non-negative number.`);
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
      details.push(`${path}.min_confidence must be a number between 0 and 1.`);
    } else {
      minConfidence = value.min_confidence;
    }
  }

  return {
    type,
    ...(effect !== undefined ? { effect } : {}),
    ...(threshold !== undefined ? { threshold } : {}),
    ...(allowlist !== undefined ? { allowlist } : {}),
    ...(minConfidence !== undefined ? { min_confidence: minConfidence } : {}),
    ...(label !== undefined ? { label } : {}),
  };
}

function readManifest(
  value: unknown,
  path: string,
  details: string[],
): AnalyzeRequest['ecosystem'] | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    details.push(`${path} must be an object.`);
    return undefined;
  }

  const name = readRequiredString(value.name, `${path}.name`, details);
  const version = readRequiredString(value.version, `${path}.version`, details);
  if (!Array.isArray(value.contracts)) {
    details.push(`${path}.contracts must be an array.`);
    return undefined;
  }

  const contracts = value.contracts
    .map((contract, index) => readManifestContract(contract, `${path}.contracts[${index}]`, details))
    .filter((contract): contract is NonNullable<AnalyzeRequest['ecosystem']>['contracts'][number] => contract !== null);

  if (!name || !version || details.length > 0) return undefined;
  return { name, version, contracts };
}

function readManifestContract(
  value: unknown,
  path: string,
  details: string[],
): NonNullable<AnalyzeRequest['ecosystem']>['contracts'][number] | null {
  if (!isRecord(value)) {
    details.push(`${path} must be an object.`);
    return null;
  }

  const name = readRequiredString(value.name, `${path}.name`, details);
  const address = readRequiredString(value.address, `${path}.address`, details);
  const network = readNetwork(value.network, `${path}.network`, details);
  const dependencies = readOptionalStringArray(value.dependencies, `${path}.dependencies`, details);
  const activeUsers = readOptionalNumber(value.active_users, `${path}.active_users`, details);
  const criticality = readOptionalEnum(value.criticality, `${path}.criticality`, ['HIGH', 'MEDIUM', 'LOW'], details);
  const role = readOptionalString(value.role, `${path}.role`, details);
  const expectedWasmHash = readOptionalWasmHash(value.expected_wasm_hash, `${path}.expected_wasm_hash`, details);

  if (!name || !address || !network) return null;
  return {
    name,
    address,
    network,
    dependencies,
    active_users: activeUsers,
    criticality,
    role,
    expected_wasm_hash: expectedWasmHash,
  };
}

function readOptionalWasmHash(value: unknown, path: string, details: string[]): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !/^[0-9a-fA-F]{64}$/.test(value.trim())) {
    details.push(`${path} must be a 64-character hex-encoded SHA-256 hash.`);
    return undefined;
  }
  return value.trim().toLowerCase();
}

function readRequiredString(value: unknown, path: string, details: string[]): string | undefined {
  if (typeof value !== 'string' || value.trim().length === 0) {
    details.push(`${path} must be a non-empty string.`);
    return undefined;
  }
  return value.trim();
}

function readOptionalString(value: unknown, path: string, details: string[]): string | undefined {
  if (value === undefined) return undefined;
  return readRequiredString(value, path, details);
}

function readNetwork(value: unknown, path: string, details: string[]): Network | undefined {
  if (value !== 'mainnet' && value !== 'testnet') {
    details.push(`${path} must be "mainnet" or "testnet".`);
    return undefined;
  }
  return value;
}

function readOptionalNetwork(value: unknown, path: string, details: string[]): Network | undefined {
  if (value === undefined) return undefined;
  return readNetwork(value, path, details);
}

function readOptionalStringArray(value: unknown, path: string, details: string[]): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.trim().length === 0)) {
    details.push(`${path} must be an array of non-empty strings.`);
    return undefined;
  }
  return value.map((item) => item.trim());
}

function readOptionalNumber(value: unknown, path: string, details: string[]): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
    details.push(`${path} must be a non-negative number.`);
    return undefined;
  }
  return value;
}

function readOptionalEnum<T extends string>(
  value: unknown,
  path: string,
  allowed: readonly T[],
  details: string[],
): T | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    details.push(`${path} must be one of: ${allowed.join(', ')}.`);
    return undefined;
  }
  return value as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalid<T>(message: string, hint: string, details: string[]): ValidationResult<T> {
  return { success: false, error: { message, hint, details } };
}

function success<T>(data: T): ValidationResult<T> {
  return { success: true, data };
}
