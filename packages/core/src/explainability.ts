import type {
  BlastRadiusContribution,
  BlastRadiusExplanation,
  EcosystemManifest,
  ExplainabilityContractNode,
  ExplainabilityContractSource,
  ExplainabilityOperationNode,
  ExplainabilityReport,
  FieldResult,
  GravityResult,
  TraceResult,
} from './types.js';

export function buildExplainabilityReport(
  trace: TraceResult,
  field: FieldResult,
  gravity: GravityResult,
  manifest?: EcosystemManifest,
): ExplainabilityReport {
  const manifestLookup = new Map(manifest?.contracts.map((contract) => [contract.address, contract]) ?? []);
  const impactLookup = new Map(gravity.affected_contracts.map((contract) => [contract.address, contract]));
  const executionContracts = new Set(
    trace.execution_path.map((step) => step.contract_id).filter((value): value is string => Boolean(value)),
  );
  const footprintContracts = new Set(trace.simulation_context.footprintContracts);

  const operations: ExplainabilityOperationNode[] = trace.execution_path.map((step) => {
    const touchedContracts = new Set<string>();
    if (step.contract_id) touchedContracts.add(step.contract_id);

    return {
      index: step.index,
      type: step.type,
      description: step.description,
      contract_id: step.contract_id,
      function_name: step.function_name,
      touched_contracts: [...touchedContracts].map((address) => {
        const impacted = impactLookup.get(address);
        return {
          address,
          sources: collectSources(address, executionContracts, footprintContracts, manifestLookup),
          impact: impacted?.impact,
          impact_reason: impacted?.reason,
        };
      }),
    };
  });

  const touchedByOperations = new Map<string, number[]>();
  for (const operation of operations) {
    for (const contract of operation.touched_contracts) {
      const existing = touchedByOperations.get(contract.address) ?? [];
      existing.push(operation.index);
      touchedByOperations.set(contract.address, existing);
    }
  }

  const contracts: ExplainabilityContractNode[] = field.dependency_graph.map((node) => {
    const manifestEntry = manifestLookup.get(node.address);
    const impacted = impactLookup.get(node.address);
    const sources = collectSources(node.address, executionContracts, footprintContracts, manifestLookup);
    const manifestInferred = node.source === 'manifest'
      && !executionContracts.has(node.address)
      && !footprintContracts.has(node.address);

    return {
      address: node.address,
      name: manifestEntry?.name ?? node.name,
      sources,
      from_execution_path: executionContracts.has(node.address),
      from_footprint: footprintContracts.has(node.address),
      from_manifest: manifestLookup.has(node.address),
      manifest_inferred: manifestInferred || undefined,
      touched_by_operations: touchedByOperations.get(node.address) ?? [],
      dependencies: node.dependencies,
      impact: impacted?.impact,
      impact_reason: impacted?.reason,
      active_users: manifestEntry?.active_users,
      criticality: manifestEntry?.criticality,
      upgrade_risk: node.upgrade_risk,
      wasm_hash: node.wasm_hash,
      wasm_hash_expected: node.wasm_hash_expected,
    };
  });

  return {
    operations,
    contracts,
    blast_radius: buildBlastRadiusExplanation(gravity),
  };
}

function collectSources(
  address: string,
  executionContracts: Set<string>,
  footprintContracts: Set<string>,
  manifestLookup: Map<string, EcosystemManifest['contracts'][number]>,
): ExplainabilityContractSource[] {
  const sources: ExplainabilityContractSource[] = [];
  if (executionContracts.has(address)) sources.push('execution_path');
  if (footprintContracts.has(address)) sources.push('footprint');
  if (manifestLookup.has(address)) sources.push('manifest');
  return sources;
}

function buildBlastRadiusExplanation(gravity: GravityResult): BlastRadiusExplanation {
  const contributions: BlastRadiusContribution[] = gravity.score_breakdown.contributions.map((contribution) => ({
    address: contribution.address,
    name: contribution.name,
    impact: contribution.impact,
    contract_score: contribution.contract_score,
    normalized_contribution: contribution.normalized_contribution,
    reason: contribution.reason,
    active_users: contribution.active_users,
    factors: contribution.factors,
  }));

  return {
    formula: gravity.score_breakdown.formula,
    total_contracts: gravity.score_breakdown.total_contracts,
    total_weighted_score: gravity.score_breakdown.total_weighted_score,
    normalized_score: gravity.score_breakdown.normalized_score,
    contributions,
  };
}
