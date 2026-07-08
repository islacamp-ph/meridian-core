import { Address, xdr } from '@stellar/stellar-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchLedgerEntryTTLs } from './rpc.js';

const mockGetLedgerEntries = vi.fn();

vi.mock('@stellar/stellar-sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@stellar/stellar-sdk')>();
  return {
    ...actual,
    rpc: {
      ...actual.rpc,
      Server: class MockServer {
        getLedgerEntries = mockGetLedgerEntries;
      },
    },
  };
});

function makeContractLedgerKey(contractId: string, symbol: string): string {
  return xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: Address.fromString(contractId).toScAddress(),
      key: xdr.ScVal.scvSymbol(symbol),
      durability: xdr.ContractDataDurability.persistent(),
    }),
  ).toXDR('base64');
}

describe('fetchLedgerEntryTTLs', () => {
  beforeEach(() => {
    mockGetLedgerEntries.mockReset();
  });

  it('returns empty array for no keys', async () => {
    const result = await fetchLedgerEntryTTLs('https://rpc.example.com', []);
    expect(result).toEqual([]);
    expect(mockGetLedgerEntries).not.toHaveBeenCalled();
  });

  it('fetches TTL metadata for ledger keys', async () => {
    const contractId = 'CA3D5KRYM6CB7OWQ6TWYRR3Z4T7GNZLKERYNZGGA5SOAOPIFY6YQGAXE';
    const ledgerKey = makeContractLedgerKey(contractId, 'counter');

    mockGetLedgerEntries.mockResolvedValueOnce({
      entries: [
        {
          key: xdr.LedgerKey.fromXDR(ledgerKey, 'base64'),
          liveUntilLedgerSeq: 1_500_000,
        },
      ],
    });

    const result = await fetchLedgerEntryTTLs('https://rpc.example.com', [ledgerKey]);
    expect(result).toHaveLength(1);
    expect(result[0].ledger_key).toBe(ledgerKey);
    expect(result[0].live_until_ledger_seq).toBe(1_500_000);
  });

  it('batches large key sets and deduplicates', async () => {
    const contractId = 'CA3D5KRYM6CB7OWQ6TWYRR3Z4T7GNZLKERYNZGGA5SOAOPIFY6YQGAXE';
    const keys = Array.from({ length: 150 }, (_, i) =>
      makeContractLedgerKey(contractId, `key_${i}`),
    );
    const duplicateKeys = [...keys, keys[0]];

    mockGetLedgerEntries.mockImplementation(async (...batchKeys: xdr.LedgerKey[]) => ({
      entries: batchKeys.map((key) => ({
        key,
        liveUntilLedgerSeq: 2_000_000,
      })),
    }));

    const result = await fetchLedgerEntryTTLs('https://rpc.example.com', duplicateKeys);
    expect(mockGetLedgerEntries).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(150);
  });

  it('returns partial results when a batch fails', async () => {
    const contractId = 'CA3D5KRYM6CB7OWQ6TWYRR3Z4T7GNZLKERYNZGGA5SOAOPIFY6YQGAXE';
    const keys = Array.from({ length: 150 }, (_, i) =>
      makeContractLedgerKey(contractId, `batch_${i}`),
    );

    mockGetLedgerEntries
      .mockResolvedValueOnce({
        entries: keys.slice(0, 100).map((key) => ({
          key: xdr.LedgerKey.fromXDR(key, 'base64'),
          liveUntilLedgerSeq: 1_000_000,
        })),
      })
      .mockRejectedValueOnce(new Error('RPC timeout'));

    const result = await fetchLedgerEntryTTLs('https://rpc.example.com', keys);
    expect(result).toHaveLength(100);
  });
});
