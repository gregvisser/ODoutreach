import { describe, expect, it } from "vitest";

import {
  computePoolDailyMax,
  countConnectedMailboxes,
  countMailboxNeedsAttention,
  googleConnectionErrorSublabel,
  isMailboxAccountDeletedError,
  MAILBOX_ACCOUNT_DELETED_SUBLABEL,
  mailboxesWhatToDoNext,
  mailboxRowOperatorStatus,
  MICROSOFT_CONNECTION_ERROR_SUBLABEL_GENERIC,
  microsoftConnectionErrorSublabel,
  operatorSignatureTableLabel,
  type OperatorMailboxRow,
} from "./mailboxes-operator-model";
import { isMailboxOAuthStateExpired } from "@/lib/mailboxes/mailbox-oauth-state-expiry";
import type { SenderSignatureViewModel } from "@/lib/mailboxes/sender-signature";

/** Fixed so every label below is asserted against a date, never against the clock. */
const NOW = new Date("2026-08-29T09:00:00.000Z");

const base = (): OperatorMailboxRow => ({
  id: "m1",
  email: "a@b.co",
  displayName: null,
  provider: "MICROSOFT",
  connectionStatus: "CONNECTED",
  workspaceRemovedAt: null,
  isActive: true,
  isPrimary: false,
  isSendingEnabled: true,
  dailySendCap: 30,
  emailsSentToday: 0,
  dailyWindowResetAt: null,
  lastError: null,
  oauthStateExpiresAt: null,
});

function vm(over: Partial<SenderSignatureViewModel>): SenderSignatureViewModel {
  return {
    resolvedDisplayName: "A",
    resolvedSignatureText: "",
    hasMailboxSignature: false,
    source: "missing",
    lastSyncedAtIso: null,
    syncError: null,
    automaticSyncSupported: true,
    ...over,
  };
}

describe("mailboxRowOperatorStatus", () => {
  it("uses plain labels for key states", () => {
    const r0 = { ...base(), connectionStatus: "DRAFT" as const };
    expect(mailboxRowOperatorStatus(r0, NOW).label).toBe("Needs connection");
    // Row 85: "Needs approval" is now the label for a sign-in that is actually
    // in flight, so this case has to supply a live window. It used to pass with
    // no expiry at all, which is precisely the state that had been reading
    // "Needs approval" on eight mailboxes for up to 67 days.
    const r1 = {
      ...base(),
      connectionStatus: "PENDING_CONNECTION" as const,
      oauthStateExpiresAt: "2026-08-29T09:10:00.000Z",
    };
    expect(mailboxRowOperatorStatus(r1, NOW).label).toBe("Needs approval");
    // PR #139: dev jargon "mailbox owner" replaced with staff-friendly copy.
    expect(mailboxRowOperatorStatus(r1, NOW).sublabel).toMatch(/Finish sign-in/i);
    expect(mailboxRowOperatorStatus(r1, NOW).sublabel).not.toContain("mailbox owner");
    // …and the same guard on the copy that replaced it for a dead window.
    const r1Dead = { ...base(), connectionStatus: "PENDING_CONNECTION" as const };
    expect(mailboxRowOperatorStatus(r1Dead, NOW).label).toBe("Sign-in never finished");
    expect(mailboxRowOperatorStatus(r1Dead, NOW).sublabel).not.toContain("mailbox owner");
    const r2 = { ...base(), connectionStatus: "CONNECTION_ERROR" as const, provider: "MICROSOFT" as const };
    expect(mailboxRowOperatorStatus(r2, NOW).sublabel).toBe(
      MICROSOFT_CONNECTION_ERROR_SUBLABEL_GENERIC,
    );
    const r3 = { ...base(), isSendingEnabled: false };
    expect(mailboxRowOperatorStatus(r3, NOW).label).toBe("Sending paused");
  });

  it("maps Microsoft AADSTS50020 to tenant guidance without raw error in sublabel", () => {
    const s = mailboxRowOperatorStatus({
      ...base(),
      connectionStatus: "CONNECTION_ERROR",
      lastError:
        "Microsoft OAuth: AADSTS50020: User from wrong tenant. ... cannot access application ... in that tenant",
    }, NOW);
    expect(s.sublabel).toContain("wrong tenant");
    expect(s.sublabel).not.toContain("AADSTS50020");
  });

  it("maps Microsoft Graph 404 in lastError", () => {
    const s = mailboxRowOperatorStatus({
      ...base(),
      connectionStatus: "CONNECTION_ERROR",
      lastError: "cannot open joe@x in Microsoft Graph (HTTP 404).",
    }, NOW);
    expect(s.sublabel).toContain("Microsoft Graph could not find");
  });

  it("maps Microsoft MFA-required refresh errors to reconnect guidance", () => {
    const s = mailboxRowOperatorStatus({
      ...base(),
      connectionStatus: "CONNECTION_ERROR",
      lastError:
        "Microsoft requires this mailbox to re-authenticate. Reconnect this mailbox and complete MFA. Microsoft token refresh failed: invalid_grant — AADSTS50076",
    }, NOW);
    expect(s.sublabel).toBe(
      "Microsoft requires this mailbox to re-authenticate. Reconnect this mailbox and complete MFA.",
    );
  });

  it("maps observed AAD5TS0276 typo/variant to reconnect guidance", () => {
    const s = mailboxRowOperatorStatus({
      ...base(),
      connectionStatus: "CONNECTION_ERROR",
      lastError:
        "Microsoft token refresh failed, invalid_grant — AAD5TS0276: You must use multi-factor authentication",
    }, NOW);
    expect(s.sublabel).toBe(
      "Microsoft requires this mailbox to re-authenticate. Reconnect this mailbox and complete MFA.",
    );
  });

  it("keeps Google CONNECTION_ERROR copy generic", () => {
    const s = mailboxRowOperatorStatus({
      ...base(),
      provider: "GOOGLE",
      connectionStatus: "CONNECTION_ERROR",
      lastError: "AADSTS50020 should not map for Google",
    }, NOW);
    expect(s.sublabel).toBe(
      "Connection did not complete. Reconnect and approve access in Google.",
    );
  });

  it("does not use EMAIL_PROVIDER or global transport in labels", () => {
    const r = { ...base() };
    const t = JSON.stringify(mailboxRowOperatorStatus(r, NOW));
    expect(t).not.toContain("EMAIL_PROVIDER");
    expect(t).not.toContain("Resend");
    expect(t).not.toContain("legacy");
  });
});

/**
 * Row 85: a mailbox pending for sixty days still told the operator to "finish
 * sign-in in the Microsoft or Google window", as if somebody were standing at
 * it. Measured in production on 2026-08-29 (probe run 33245630085): all 8
 * stranded rows carried a real expiry and every one of them had CLOSED —
 * between 2 and 67 days earlier. Not one was NULL.
 */
describe("mailboxRowOperatorStatus — PENDING_CONNECTION and the sign-in window", () => {
  const pending = (expiresAt: string | null): OperatorMailboxRow => ({
    ...base(),
    connectionStatus: "PENDING_CONNECTION" as const,
    oauthStateExpiresAt: expiresAt,
  });

  it("still reads exactly as it did while the sign-in really is in flight", () => {
    // MUST NOT CHANGE. For the 15 minutes the state is alive the old sentence
    // is the correct one, and somebody genuinely is standing at the window.
    const s = mailboxRowOperatorStatus(pending("2026-08-29T09:10:00.000Z"), NOW);
    expect(s.kind).toBe("needs_approval");
    expect(s.label).toBe("Needs approval");
    expect(s.sublabel).toBe(
      "Finish sign-in in the Microsoft or Google window, or press Connect again.",
    );
  });

  it("stops telling the operator to finish a window that closed 60 days ago", () => {
    // protech-roofing's real row: window closed 2026-06-29T11:09:26.937Z.
    const s = mailboxRowOperatorStatus(pending("2026-06-29T11:09:26.937Z"), NOW);
    expect(s.kind).toBe("sign_in_expired");
    expect(s.label).not.toBe("Needs approval");
    expect(s.sublabel).not.toMatch(/finish sign-in/i);
    // It must say WHEN it closed — a date is the difference between "this is
    // stale" and a number the operator can act on.
    expect(s.sublabel).toContain("29 Jun 2026");
    expect(s.sublabel).toMatch(/Connect/);
  });

  it("names the closure date in UTC, never the viewer's timezone", () => {
    // 00:30 UTC on 3 July is 2 July in New York and 3 July in London. Formatting
    // through the local timezone would render a different date on the server
    // than in the browser, which is a hydration mismatch on a date nobody can
    // verify. The date shown is always the UTC one.
    const s = mailboxRowOperatorStatus(pending("2026-07-03T00:30:00.000Z"), NOW);
    expect(s.sublabel).toContain("3 Jul 2026");
  });

  it("treats a NULL expiry as closed, and does not invent a date for it", () => {
    // Decided explicitly rather than left to fall through. Two independent
    // reasons, both provable from shipped code rather than assumed:
    //  1. `isMailboxOAuthStateExpired(null)` is TRUE, and both OAuth callbacks
    //     apply that gate before anything else — so the server would REFUSE a
    //     returning sign-in on this row. Telling the operator to finish it
    //     would be telling them to do something the product refuses.
    //  2. Every writer of `oauthStateExpiresAt: null` in this codebase moves
    //     the row off PENDING_CONNECTION in the same update, so this pairing is
    //     one the current code cannot even produce. Production holds none.
    // It is therefore a defensive branch, and it must not fabricate a date.
    const s = mailboxRowOperatorStatus(pending(null), NOW);
    expect(s.kind).toBe("sign_in_expired");
    expect(s.sublabel).not.toMatch(/finish sign-in/i);
    expect(s.sublabel).not.toMatch(/\d{4}/); // no year => no invented date
    expect(s.sublabel).toMatch(/Connect/);
  });

  it("offers to finish the sign-in exactly when the callback would accept it", () => {
    // The property that makes this honest rather than merely softer wording:
    // the screen and the OAuth callback read the SAME shipped predicate, so the
    // screen can never invite an operator into a round trip the server refuses.
    for (const iso of [
      "2026-06-22T09:48:01.492Z", // real protech row, long closed
      "2026-08-29T08:59:59.999Z", // one millisecond past
      "2026-08-29T09:00:00.000Z", // exactly now — inclusive boundary, still open
      "2026-08-29T09:14:00.000Z", // in flight
      null,
    ]) {
      const callbackWouldAccept = !isMailboxOAuthStateExpired(
        iso ? new Date(iso) : null,
        NOW,
      );
      const s = mailboxRowOperatorStatus(pending(iso), NOW);
      expect(/finish sign-in/i.test(s.sublabel ?? "")).toBe(callbackWouldAccept);
    }
  });

  it("leaves a closed window out of the other status branches", () => {
    // A dead sign-in window says nothing about a CONNECTED or DRAFT row, and
    // must not leak into their labels.
    const connected = mailboxRowOperatorStatus(
      { ...base(), oauthStateExpiresAt: "2026-06-01T00:00:00.000Z" },
      NOW,
    );
    expect(connected.label).toBe("Connected");
    const draft = mailboxRowOperatorStatus(
      {
        ...base(),
        connectionStatus: "DRAFT" as const,
        oauthStateExpiresAt: "2026-06-01T00:00:00.000Z",
      },
      NOW,
    );
    expect(draft.label).toBe("Needs connection");
  });

  it("a deleted account still outranks a closed sign-in window", () => {
    // Ordering that must hold: there is no sign-in to start for an account that
    // no longer exists, so "press Connect" must not be offered to it.
    const s = mailboxRowOperatorStatus(
      {
        ...pending("2026-06-22T09:48:01.492Z"),
        lastError: "AADSTS500341: The user account has been deleted.",
      },
      NOW,
    );
    expect(s.kind).toBe("account_deleted");
  });
});

describe("microsoftConnectionErrorSublabel", () => {
  it("maps AADSTS50020", () => {
    expect(
      microsoftConnectionErrorSublabel("error AADSTS50020 user not in tenant"),
    ).toContain("wrong tenant");
  });
});

describe("countMailboxNeedsAttention", () => {
  it("counts connection issues and missing signatures", () => {
    const rows: OperatorMailboxRow[] = [
      { ...base(), id: "a", connectionStatus: "CONNECTED" },
      { ...base(), id: "b", connectionStatus: "DRAFT" },
    ];
    const vms: SenderSignatureViewModel[] = [
      vm({ source: "missing", resolvedSignatureText: "" }),
      vm({ source: "manual", resolvedSignatureText: "ok" }),
    ];
    expect(
      countMailboxNeedsAttention({ activeRows: rows, viewModels: vms }),
    ).toBe(2);
  });
});

describe("mailboxesWhatToDoNext", () => {
  it("returns add-first for empty", () => {
    expect(
      mailboxesWhatToDoNext({ activeRowCount: 0, needsAttentionCount: 0 })
        .kind,
    ).toBe("add_first");
  });
  it("returns all ready when no attention", () => {
    expect(
      mailboxesWhatToDoNext({ activeRowCount: 1, needsAttentionCount: 0 })
        .kind,
    ).toBe("all_ready");
  });
});

describe("computePoolDailyMax", () => {
  it("uses ledger cap when available", () => {
    const rows = [base()];
    const max = computePoolDailyMax(rows, { m1: { cap: 30, bookedInUtcDay: 0, remaining: 30 } });
    expect(max).toBe(30);
  });
});

describe("countConnectedMailboxes", () => {
  it("counts only CONNECTED", () => {
    const rows: OperatorMailboxRow[] = [
      { ...base(), id: "a", connectionStatus: "CONNECTED" },
      { ...base(), id: "b", connectionStatus: "DRAFT" },
    ];
    expect(countConnectedMailboxes(rows)).toBe(1);
  });
});

describe("operatorSignatureTableLabel", () => {
  it("keeps Microsoft honest: no auto-sync", () => {
    const t = operatorSignatureTableLabel(
      { provider: "MICROSOFT", connectionStatus: "CONNECTED" },
      vm({ source: "unsupported_provider" }),
    );
    expect(t.isSyncedGmail).toBe(false);
    expect(t.label).toBe("Needs signature");
  });

  it("labels Gmail as synced from Gmail when send-as and timestamp exist", () => {
    const t = operatorSignatureTableLabel(
      { provider: "GOOGLE", connectionStatus: "CONNECTED" },
      vm({ source: "gmail_send_as", lastSyncedAtIso: "2026-01-01" }),
    );
    expect(t.label).toBe("Synced from Gmail");
    expect(t.isSyncedGmail).toBe(true);
  });
});

/**
 * The screen is where the eight dead mailboxes actually did their damage: all
 * eight read "Connected", so nobody looked further. Two of them could never be
 * repaired at all, and the screen offered a repair instruction anyway.
 */
describe("a mailbox that cannot be reconnected says so", () => {
  const deletedAccountError =
    "This mailbox cannot be reconnected — the account no longer exists. Microsoft token refresh failed: invalid_grant - AADSTS500341: The user account has been deleted from the directory.";

  it("labels a deleted account 'Cannot be reconnected', not 'Connection failed'", () => {
    const row = {
      ...base(),
      connectionStatus: "DISCONNECTED" as const,
      lastError: deletedAccountError,
    };
    const status = mailboxRowOperatorStatus(row, NOW);
    expect(status.kind).toBe("account_deleted");
    expect(status.label).toBe("Cannot be reconnected");
    expect(status.sublabel).toBe(MAILBOX_ACCOUNT_DELETED_SUBLABEL);
  });

  it("says so whichever status the row happens to carry", () => {
    // The two Chevron rows were CONNECTED at discovery. The answer must not
    // depend on which column the last write happened to reach.
    for (const connectionStatus of [
      "CONNECTED",
      "CONNECTION_ERROR",
      "DISCONNECTED",
    ] as const) {
      const status = mailboxRowOperatorStatus({
        ...base(),
        connectionStatus,
        lastError: deletedAccountError,
      }, NOW);
      expect(status.label).toBe("Cannot be reconnected");
    }
  });

  it("never tells a deleted account to reconnect or complete MFA", () => {
    // The exact wrong instruction the product gave for weeks: AADSTS500341
    // arrives wrapped in invalid_grant, and the invalid_grant branch answered
    // first. This asserts the ordering, not just the wording.
    const sublabel = microsoftConnectionErrorSublabel(deletedAccountError);
    expect(sublabel).toBe(MAILBOX_ACCOUNT_DELETED_SUBLABEL);
    expect(sublabel).not.toMatch(/complete MFA/i);
    expect(sublabel).not.toMatch(/reconnect this mailbox/i);
  });

  it("still tells an ordinary expired Microsoft sign-in to reconnect", () => {
    expect(
      microsoftConnectionErrorSublabel("Microsoft token refresh failed: invalid_grant"),
    ).toMatch(/complete MFA/i);
  });

  it("isMailboxAccountDeletedError ignores unrelated errors", () => {
    expect(isMailboxAccountDeletedError(null)).toBe(false);
    expect(isMailboxAccountDeletedError("")).toBe(false);
    expect(isMailboxAccountDeletedError("invalid_grant")).toBe(false);
    expect(isMailboxAccountDeletedError("AADSTS50020: wrong tenant")).toBe(false);
    expect(isMailboxAccountDeletedError("aadsts500341: gone")).toBe(true);
  });
});

describe("googleConnectionErrorSublabel", () => {
  it("names the real cause — an expired login, not an abandoned sign-in", () => {
    const sublabel = googleConnectionErrorSublabel(
      "Google token refresh failed: invalid_grant",
    );
    expect(sublabel).toMatch(/expired/i);
    expect(sublabel).toMatch(/Reconnect/i);
    expect(sublabel).not.toMatch(/did not complete/i);
  });

  it("falls back to the generic wording when the error says nothing useful", () => {
    expect(googleConnectionErrorSublabel(null)).toMatch(/did not complete/i);
  });

  it("is what a Google CONNECTION_ERROR row actually shows", () => {
    const status = mailboxRowOperatorStatus({
      ...base(),
      provider: "GOOGLE",
      connectionStatus: "CONNECTION_ERROR",
      lastError: "Google token refresh failed: invalid_grant",
    }, NOW);
    expect(status.sublabel).toMatch(/expired/i);
  });
});
