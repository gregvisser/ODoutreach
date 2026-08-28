import "server-only";

/**
 * One import for the scheduled sweep to reach.
 *
 * The verifier is split in two on purpose — the LOOKING and the DECIDING live in
 * `tracking-dns-verification.ts` with no database import, so both are drivable
 * from a test with no Postgres and no network, while the writes live in
 * `tracking-dns-persistence.ts`. That split is what lets a test prove the
 * auto-disable fires without touching a row, and it must not be collapsed.
 *
 * The cost of the split is that the ops script would otherwise need to know
 * which half each function lives in. This file is that seam and nothing else:
 * re-exports only, no logic, so there is no third place for a decision to hide.
 */

export {
  liveTrackingDnsResolver,
  sweepTrackingDnsRegressions,
  verifyClientTrackingDns,
  resolveClientTrackingDnsProvider,
  resolveClientSendingDomain,
  type TrackedClientRow,
  type TrackingDnsResolver,
  type TrackingDnsSweepResult,
} from "./tracking-dns-verification";

export {
  loadTrackedClientsForDnsSweep,
  persistTrackingDnsCheck,
  disableTrackingForDnsRegression,
} from "./tracking-dns-persistence";
