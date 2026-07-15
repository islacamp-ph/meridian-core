import { describe, expect, it } from 'vitest';
import {
  buildContractVersionDiffs,
  compareInvokePaths,
  evaluatePathExpectation,
} from './path.js';
import type { FieldResult } from './types.js';

describe('evaluatePathExpectation', () => {
  it('reports missing and unexpected steps', () => {
    const result = evaluatePathExpectation(
      [
        { contract_id: 'CA', function_name: 'swap' },
        { contract_id: 'CB', function_name: 'transfer' },
      ],
      [{ contract_id: 'CA', function_name: 'swap' }, { contract_id: 'CX', function_name: 'x' }],
    );
    expect(result.matched_fully).toBe(false);
    expect(result.missing).toEqual([{ contract_id: 'CB', function_name: 'transfer' }]);
    expect(result.unexpected[0].contract_id).toBe('CX');
  });
});

describe('compareInvokePaths', () => {
  it('computes added and removed path steps', () => {
    const delta = compareInvokePaths(
      [{ contract_id: 'CA', function_name: 'a' }],
      [{ contract_id: 'CA', function_name: 'a' }, { contract_id: 'CB', function_name: 'b' }],
    );
    expect(delta.added).toEqual([{ contract_id: 'CB', function_name: 'b' }]);
    expect(delta.removed).toEqual([]);
  });
});

describe('buildContractVersionDiffs', () => {
  it('surfaces wasm drift warnings', () => {
    const field: FieldResult = {
      contracts_mapped: 1,
      dependency_graph: [{ address: 'CA', dependencies: [], depth: 0, wasm_hash: 'bb'.repeat(32) }],
      ttl_warnings: [],
      manifest_coverage: 1,
      upgrade_warnings: [{
        contract_id: 'CA',
        name: 'Router',
        expected_wasm_hash: 'aa'.repeat(32),
        on_chain_wasm_hash: 'bb'.repeat(32),
      }],
    };
    const diffs = buildContractVersionDiffs(field);
    expect(diffs[0].drift).toBe(true);
    expect(diffs[0].contract_id).toBe('CA');
  });
});
