import { describe, it, expect } from 'vitest';
import { parseNetwork, parseThreshold } from './options.js';

describe('parseNetwork', () => {
  it('accepts mainnet and testnet', () => {
    expect(parseNetwork('mainnet')).toBe('mainnet');
    expect(parseNetwork('testnet')).toBe('testnet');
  });

  it('rejects invalid networks', () => {
    expect(() => parseNetwork('devnet')).toThrow();
  });
});

describe('parseThreshold', () => {
  it('accepts numbers within 0 and 1', () => {
    expect(parseThreshold('0')).toBe(0);
    expect(parseThreshold('0.75')).toBe(0.75);
    expect(parseThreshold('1')).toBe(1);
  });

  it('rejects out-of-range and non-numeric values', () => {
    expect(() => parseThreshold('1.5')).toThrow();
    expect(() => parseThreshold('-0.1')).toThrow();
    expect(() => parseThreshold('abc')).toThrow();
  });
});
