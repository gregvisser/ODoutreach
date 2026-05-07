import { describe, expect, it } from "vitest";

import { shouldApplyMailboxAuthFailureOverlay } from "./mailbox-auth-failure-overlay";

describe("shouldApplyMailboxAuthFailureOverlay", () => {
  const t0 = new Date("2026-05-01T12:00:00.000Z");
  const tConnect = new Date("2026-05-07T10:00:00.000Z");
  const failure = { message: "invalid_grant", failedAt: new Date("2026-05-06T08:00:00.000Z") };

  it("does not override CONNECTED when failure is older than connectedAt", () => {
    expect(
      shouldApplyMailboxAuthFailureOverlay({
        dbConnectionStatus: "CONNECTED",
        connectedAt: tConnect,
        mailboxUpdatedAt: t0,
        failure,
      }),
    ).toBe(false);
  });

  it("still overrides when CONNECTED but failure is newer than connectedAt", () => {
    expect(
      shouldApplyMailboxAuthFailureOverlay({
        dbConnectionStatus: "CONNECTED",
        connectedAt: tConnect,
        mailboxUpdatedAt: t0,
        failure: {
          message: "invalid_grant",
          failedAt: new Date("2026-05-07T11:00:00.000Z"),
        },
      }),
    ).toBe(true);
  });

  it("applies when DB status is not CONNECTED", () => {
    expect(
      shouldApplyMailboxAuthFailureOverlay({
        dbConnectionStatus: "CONNECTION_ERROR",
        connectedAt: null,
        mailboxUpdatedAt: t0,
        failure,
      }),
    ).toBe(true);
  });

  it("uses mailboxUpdatedAt when connectedAt is null and CONNECTED", () => {
    expect(
      shouldApplyMailboxAuthFailureOverlay({
        dbConnectionStatus: "CONNECTED",
        connectedAt: null,
        mailboxUpdatedAt: new Date("2026-05-08T00:00:00.000Z"),
        failure: {
          message: "invalid_grant",
          failedAt: new Date("2026-05-07T08:00:00.000Z"),
        },
      }),
    ).toBe(false);
  });
});
