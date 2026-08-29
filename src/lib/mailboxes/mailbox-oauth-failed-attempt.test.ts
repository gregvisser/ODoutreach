import { describe, expect, it } from "vitest";

import {
  mailboxOAuthFailedAttemptUpdate,
  shouldPreserveMailboxOnFailedOAuthAttempt,
  type MailboxOAuthFailedAttemptRow,
} from "./mailbox-oauth-failed-attempt";

/** A mailbox that is sending real mail right now. */
const LIVE: MailboxOAuthFailedAttemptRow = {
  connectionStatus: "CONNECTED",
  hasStoredCredential: true,
  isActive: true,
  workspaceRemovedAt: null,
};

describe("shouldPreserveMailboxOnFailedOAuthAttempt", () => {
  it("preserves a mailbox that can send today", () => {
    expect(shouldPreserveMailboxOnFailedOAuthAttempt(LIVE)).toBe(true);
  });

  /**
   * The case the queue item names as the proof, because it is the one where the
   * stored credential is DEFINITELY still fine: the operator approved consent
   * as somebody else. The exchange succeeded. Nothing in that round trip so
   * much as read this mailbox's refresh token, so nothing in it is evidence
   * about the token.
   */
  it("writes no status and no error for a live mailbox", () => {
    const update = mailboxOAuthFailedAttemptUpdate(
      LIVE,
      "You approved as greg@example.com, but this mailbox is alex@example.com.",
    );

    // Absent, not null: an omitted Prisma column is left alone, null erases.
    expect(update).toEqual({ oauthState: null, oauthStateExpiresAt: null });
    expect("connectionStatus" in update).toBe(false);
    expect("lastError" in update).toBe(false);
  });

  /**
   * A CONNECTED row with no secret is the stranded state — it reads "Connected"
   * and cannot send a thing. There is nothing to protect and the row is already
   * lying, so the failure gets recorded.
   */
  it("records the failure when a CONNECTED row holds no credential", () => {
    const update = mailboxOAuthFailedAttemptUpdate(
      { ...LIVE, hasStoredCredential: false },
      "Google token exchange failed: invalid_grant",
    );

    expect(update.connectionStatus).toBe("CONNECTION_ERROR");
    expect(update.lastError).toBe("Google token exchange failed: invalid_grant");
  });

  it.each([
    "DRAFT",
    "PENDING_CONNECTION",
    "CONNECTION_ERROR",
    "DISCONNECTED",
  ] as const)("records the failure for a %s row", (connectionStatus) => {
    const update = mailboxOAuthFailedAttemptUpdate(
      { ...LIVE, connectionStatus },
      "provider said no",
    );

    expect(update.connectionStatus).toBe("CONNECTION_ERROR");
  });

  it("does not protect an inactive or removed mailbox", () => {
    expect(
      shouldPreserveMailboxOnFailedOAuthAttempt({ ...LIVE, isActive: false }),
    ).toBe(false);
    expect(
      shouldPreserveMailboxOnFailedOAuthAttempt({
        ...LIVE,
        workspaceRemovedAt: new Date("2026-08-01T00:00:00.000Z"),
      }),
    ).toBe(false);
  });

  /** The state is spent either way — leaving it live is the hazard cycle 73 shut. */
  it("always clears the in-flight state, preserved or not", () => {
    for (const row of [LIVE, { ...LIVE, hasStoredCredential: false }]) {
      const update = mailboxOAuthFailedAttemptUpdate(row, "boom");
      expect(update.oauthState).toBeNull();
      expect(update.oauthStateExpiresAt).toBeNull();
    }
  });

  it("truncates a recorded error to the column's limit", () => {
    const update = mailboxOAuthFailedAttemptUpdate(
      { ...LIVE, hasStoredCredential: false },
      "x".repeat(9000),
    );

    expect(update.lastError).toHaveLength(4000);
  });
});
