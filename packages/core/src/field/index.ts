import { logger } from '../logger.js';
import type {
  DependencyNode,
  DependencyNodeSource,
  EcosystemManifest,
  FieldOptions,
  FieldResult,
  SimulationContext,
  TraceResult,
  UpgradeWarning,
} from '../types.js';
import { checkTTLWarnings, extractFootprint, mergeSimulationContexts } from '../trace/parser.js';
import {
  fetchContractWasmHash,
  fetchLedgerEntryTTLs,
  resolveRpcUrl,
  simulateTransaction,
} from '../trace/rpc.js';

/**
 * Build dependency graph from simulation footprint and optional ecosystem manifest.
 * Performs TTL checks, WASM metadata enrichment, upgrade-risk detection,
 * and optional record-mode re-simulation for deep discovery.
 *
 * @param trace - TRACE result with execution path and footprint
 * @param context - Simulation context with footprint contracts
 * @param options - Field options including optional manifest and RPC settings
 * @returns Structured FieldResult
 */
export async function buildFieldGraph(
  trace: TraceResult,
  context: SimulationContext,
  options?: FieldOptions,
): Promise<FieldResult> {
  const network = options?.network ?? 'testnet';
  const rpcUrl = options?.rpcUrl ?? resolveRpcUrl(network);
  const timeoutMs = options?.timeoutMs ?? 30_000;
  const discoveryAuthMode = options?.deepDiscovery
    ? 'record_allow_nonroot'
    : (options?.authMode ?? 'record');

  let mergedContext = context;
  const contractSources = new Map<string, DependencyNodeSource>();

  for (const address of context.footprintContracts) {
    contractSources.set(address, 'footprint');
  }
  for (const step of trace.execution_path) {
    if (step.contract_id) {
      contractSources.set(step.contract_id, 'execution_path');
    }
  }

  if (discoveryAuthMode !== 'enforce' && options?.txXdr) {
    const recordSim = await simulateTransaction(options.txXdr, rpcUrl, {
      network,
      authMode: discoveryAuthMode,
      timeoutMs,
    });

    if (!('layer' in recordSim) && recordSim.sorobanData) {
      const recordContext = extractFootprint(
        recordSim.sorobanData,
        recordSim.simulationLedger,
        recordSim.latestLedger,
      );
      mergedContext = mergeSimulationContexts(context, recordContext);
      for (const address of recordContext.footprintContracts) {
        if (!contractSources.has(address)) {
          contractSources.set(address, 'record_discovery');
        }
      }
    }
  }

  logger.info('field:start', { contracts: mergedContext.footprintContracts.length });

  const manifest = options?.manifest;
  const manifestLookup = buildManifestLookup(manifest);
  const observedContracts = collectObservedContracts(trace, mergedContext);
  const contractDepths = buildContractDepths(observedContracts, manifestLookup);

  for (const address of contractDepths.keys()) {
    if (!contractSources.has(address)) {
      contractSources.set(address, 'manifest');
    }
  }

  const upgradeWarnings: UpgradeWarning[] = [];
  const dependencyGraph: DependencyNode[] = await Promise.all(
    [...contractDepths.entries()]
      .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
      .map(async ([address, depth]) => {
        const manifestEntry = manifestLookup.get(address);
        const wasmHash = await fetchContractWasmHash(rpcUrl, address, timeoutMs);
        const expectedWasm = manifestEntry?.expected_wasm_hash;
        const upgradeRisk = Boolean(
          expectedWasm && wasmHash && normalizeWasmHash(expectedWasm) !== normalizeWasmHash(wasmHash),
        );

        if (upgradeRisk && expectedWasm && wasmHash) {
          upgradeWarnings.push({
            contract_id: address,
            name: manifestEntry?.name,
            expected_wasm_hash: normalizeWasmHash(expectedWasm),
            on_chain_wasm_hash: normalizeWasmHash(wasmHash),
          });
        }

        return {
          address,
          name: manifestEntry?.name,
          dependencies: manifestEntry?.dependencies ?? [],
          depth,
          source: contractSources.get(address),
          wasm_hash: wasmHash,
          wasm_hash_expected: expectedWasm ? normalizeWasmHash(expectedWasm) : undefined,
          upgrade_risk: upgradeRisk || undefined,
        };
      }),
  );

  const manifestCoverage = computeManifestCoverage(observedContracts, manifest);
  const ledgerKeys = [...new Set([...mergedContext.readOnly, ...mergedContext.readWrite])];
  const entryTtls = await fetchLedgerEntryTTLs(rpcUrl, ledgerKeys, timeoutMs);
  const ttlWarnings = checkTTLWarnings(ledgerKeys, mergedContext.ledgerSequence, entryTtls);

  return {
    contracts_mapped: dependencyGraph.length,
    dependency_graph: dependencyGraph,
    ttl_warnings: ttlWarnings,
    manifest_coverage: manifestCoverage,
    upgrade_warnings: upgradeWarnings,
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
): Map<string, { name: string; dependencies?: string[]; expected_wasm_hash?: string }> {
  const lookup = new Map<string, { name: string; dependencies?: string[]; expected_wasm_hash?: string }>();
  if (!manifest) return lookup;

  for (const contract of manifest.contracts) {
    lookup.set(contract.address, {
      name: contract.name,
      dependencies: contract.dependencies,
      expected_wasm_hash: contract.expected_wasm_hash,
    });
  }
  return lookup;
}

function normalizeWasmHash(hash: string): string {
  return hash.trim().toLowerCase().replace(/^0x/, '');
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
  manifestLookup: Map<string, { name: string; dependencies?: string[]; expected_wasm_hash?: string }>,
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
