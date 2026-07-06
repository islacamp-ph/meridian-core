import { logger } from '../logger.js';
import type {
  DependencyNode,
  EcosystemManifest,
  FieldOptions,
  FieldResult,
  SimulationContext,
  TraceResult,
} from '../types.js';

/**
 * Build dependency graph from simulation footprint and optional ecosystem manifest.
 * Phase 1: footprint-based mapping with manifest enrichment.
 *
 * @param trace - TRACE result with execution path and footprint
 * @param context - Simulation context with footprint contracts
 * @param options - Field options including optional manifest
 * @returns Structured FieldResult
 */
export function buildFieldGraph(
  trace: TraceResult,
  context: SimulationContext,
  options?: FieldOptions,
): FieldResult {
  logger.info('field:start', { contracts: context.footprintContracts.length });

  const manifest = options?.manifest;
  const manifestLookup = buildManifestLookup(manifest);
  const observedContracts = collectObservedContracts(trace, context);
  const contractDepths = buildContractDepths(observedContracts, manifestLookup);

  const dependencyGraph: DependencyNode[] = [...contractDepths.entries()]
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
    .map(([address, depth]) => {
      const manifestEntry = manifestLookup.get(address);
      return {
        address,
        name: manifestEntry?.name,
        dependencies: manifestEntry?.dependencies ?? [],
        depth,
      };
    });

  const manifestCoverage = computeManifestCoverage(observedContracts, manifest);

  return {
    contracts_mapped: dependencyGraph.length,
    dependency_graph: dependencyGraph,
    ttl_warnings: [],
    manifest_coverage: manifestCoverage,
  };
}

/**
 * Build a lookup map from manifest contract addresses.
 *
 * @param manifest - Optional ecosystem manifest
 * @returns Map of address to manifest contract
 */
function buildManifestLookup(
  manifest?: EcosystemManifest,
): Map<string, { name: string; dependencies?: string[] }> {
  const lookup = new Map<string, { name: string; dependencies?: string[] }>();
  if (!manifest) return lookup;

  for (const contract of manifest.contracts) {
    lookup.set(contract.address, {
      name: contract.name,
      dependencies: contract.dependencies,
    });
  }
  return lookup;
}

/**
 * Compute manifest coverage ratio for footprint contracts.
 *
 * @param contracts - Set of contract addresses from footprint
 * @param manifest - Optional ecosystem manifest
 * @returns Coverage ratio 0.0 - 1.0
 */
function computeManifestCoverage(
  contracts: Set<string>,
  manifest?: EcosystemManifest,
): number {
  if (!manifest || contracts.size === 0) return 0;
  const manifestAddresses = new Set(manifest.contracts.map((c) => c.address));
  let covered = 0;
  for (const addr of contracts) {
    if (manifestAddresses.has(addr)) covered++;
  }
  return covered / contracts.size;
}

function collectObservedContracts(trace: TraceResult, context: SimulationContext): Set<string> {
  const contracts = new Set<string>(context.footprintContracts);
  for (const step of trace.execution_path) {
    if (step.contract_id) contracts.add(step.contract_id);
  }
  return contracts;
}

function buildContractDepths(
  observedContracts: Set<string>,
  manifestLookup: Map<string, { name: string; dependencies?: string[] }>,
): Map<string, number> {
  const depths = new Map<string, number>();
  const queue: Array<{ address: string; depth: number }> = [...observedContracts].map((address) => ({
    address,
    depth: 0,
  }));

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;

    const existingDepth = depths.get(current.address);
    if (existingDepth !== undefined && existingDepth <= current.depth) {
      continue;
    }

    depths.set(current.address, current.depth);
    const dependencies = manifestLookup.get(current.address)?.dependencies ?? [];
    for (const dependency of dependencies) {
      queue.push({ address: dependency, depth: current.depth + 1 });
    }
  }

  return depths;
}
