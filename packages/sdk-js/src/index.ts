/**
 * @meridian/stellar — JavaScript SDK for MERIDIAN.
 *
 * - `MeridianClient` — HTTP client for the MERIDIAN REST API
 * - Re-exports core engines and types for local/offline analysis
 */
export {
  MeridianClient,
  MeridianClientError,
  type MeridianClientOptions,
  type TraceRequest,
  type FieldRequest,
  type GravityRequest,
  type BatchAnalyzeRequest,
} from './client.js';

export {
  MERIDIAN_VERSION,
  analyze,
  analyzeBatch,
  analyzeDiff,
  buildFieldGraph,
  checkTTLWarnings,
  computeConfidence,
  computeVerdict,
  fetchLedgerEntryTTLs,
  generateFixSequence,
  scoreGravity,
  simulateTransaction,
  trace,
} from '@meridian/core';

export type * from '@meridian/core';
