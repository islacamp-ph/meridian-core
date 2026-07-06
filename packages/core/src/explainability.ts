import type {
  BlastRadiusContribution,
  BlastRadiusExplanation,
  ContractImpact,
  EcosystemManifest,
  ExplainabilityContractNode,
  ExplainabilityContractSource,
  ExplainabilityOperationNode,
  ExplainabilityReport,
  FieldResult,
  GravityResult,
  ImpactLevel,
  TraceResult,
} from './types.js';

const CRITICAL_WEIGHT = 40;
const WARNING_WEIGHT = 15;

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

    return {
      address: node.address,
      name: manifestEntry?.name ?? node.name,
      sources,
      from_execution_path: executionContracts.has(node.address),
      from_footprint: footprintContracts.has(node.address),
      from_manifest: manifestLookup.has(node.address),
      touched_by_operations: touchedByOperations.get(node.address) ?? [],
      dependencies: node.dependencies,
      impact: impacted?.impact,
      impact_reason: impacted?.reason,
      active_users: manifestEntry?.active_users,
      criticality: manifestEntry?.criticality,
    };
  });

  return {
    operations,
    contracts,
    blast_radius: buildBlastRadiusExplanation(field.contracts_mapped, gravity.affected_contracts, gravity),
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

function buildBlastRadiusExplanation(
  totalContracts: number,
  affectedContracts: ContractImpact[],
  gravity: GravityResult,
): BlastRadiusExplanation {
  const contributions: BlastRadiusContribution[] = affectedContracts
    .filter((contract) => contract.impact === 'CRITICAL' || contract.impact === 'WARNING')
    .map((contract) => ({
      address: contract.address,
      name: contract.name,
      impact: contract.impact,
      weight: impactWeight(contract.impact),
      reason: contract.reason,
      active_users: contract.active_users,
    }));

  const weightedTotal = contributions.reduce((sum, contract) => sum + contract.weight, 0);
  const rawScore = totalContracts === 0 ? 0 : weightedTotal / totalContracts;

  return {
    formula: '((critical_count * 40) + (warning_count * 15)) / total_contracts',
    critical_weight: CRITICAL_WEIGHT,
    warning_weight: WARNING_WEIGHT,
    total_contracts: totalContracts,
    critical_count: gravity.critical.length,
    warning_count: gravity.warning.length,
    raw_score: Math.round(rawScore * 100) / 100,
    normalized_score: gravity.blast_radius,
    contributions,
  };
}

function impactWeight(impact: ImpactLevel): number {
  switch (impact) {
    case 'CRITICAL':
      return CRITICAL_WEIGHT;
    case 'WARNING':
      return WARNING_WEIGHT;
    default:
      return 0;
  }
}
