/**
 * @meridian/stellar — JavaScript SDK for MERIDIAN.
 *
 * - `MeridianClient` — HTTP client for the MERIDIAN REST API
 * - `preflight` / `toPreSignPreview` — wallet / dapp pre-sign risk preview
 * - `screeningPolicyRules` / `toScreeningResult` — exchange/custodian screening helpers
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
  type ScreenRequest,
  type WebhookSubscription,
} from './client.js';

export {
  preflight,
  toPreSignPreview,
  type PreflightRequest,
  type PreSignPreview,
} from './preflight.js';

export {
  screeningPolicyRules,
  toScreeningResult,
  type ScreeningProfile,
  type ScreeningDisposition,
  type ScreeningResult,
} from './screening.js';

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
