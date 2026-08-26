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
import type { SenderSignatureViewModel } from "@/lib/mailboxes/sender-signature";

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
    expect(mailboxRowOperatorStatus(r0).label).toBe("Needs connection");
    const r1 = { ...base(), connectionStatus: "PENDING_CONNECTION" as const };
    expect(mailboxRowOperatorStatus(r1).label).toBe("Needs approval");
    // PR #139: dev jargon "mailbox owner" replaced with staff-friendly copy.
    expect(mailboxRowOperatorStatus(r1).sublabel).toMatch(/Finish sign-in/i);
    expect(mailboxRowOperatorStatus(r1).sublabel).not.toContain("mailbox owner");
    const r2 = { ...base(), connectionStatus: "CONNECTION_ERROR" as const, provider: "MICROSOFT" as const };
    expect(mailboxRowOperatorStatus(r2).sublabel).toBe(
      MICROSOFT_CONNECTION_ERROR_SUBLABEL_GENERIC,
    );
    const r3 = { ...base(), isSendingEnabled: false };
    expect(mailboxRowOperatorStatus(r3).label).toBe("Sending paused");
  });

  it("maps Microsoft AADSTS50020 to tenant guidance without raw error in sublabel", () => {
    const s = mailboxRowOperatorStatus({
      ...base(),
      connectionStatus: "CONNECTION_ERROR",
      lastError:
        "Microsoft OAuth: AADSTS50020: User from wrong tenant. ... cannot access application ... in that tenant",
    });
    expect(s.sublabel).toContain("wrong tenant");
    expect(s.sublabel).not.toContain("AADSTS50020");
  });

  it("maps Microsoft Graph 404 in lastError", () => {
    const s = mailboxRowOperatorStatus({
      ...base(),
      connectionStatus: "CONNECTION_ERROR",
      lastError: "cannot open joe@x in Microsoft Graph (HTTP 404).",
    });
    expect(s.sublabel).toContain("Microsoft Graph could not find");
  });

  it("maps Microsoft MFA-required refresh errors to reconnect guidance", () => {
    const s = mailboxRowOperatorStatus({
      ...base(),
      connectionStatus: "CONNECTION_ERROR",
      lastError:
        "Microsoft requires this mailbox to re-authenticate. Reconnect this mailbox and complete MFA. Microsoft token refresh failed: invalid_grant — AADSTS50076",
    });
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
    });
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
    });
    expect(s.sublabel).toBe(
      "Connection did not complete. Reconnect and approve access in Google.",
    );
  });

  it("does not use EMAIL_PROVIDER or global transport in labels", () => {
    const r = { ...base() };
    const t = JSON.stringify(mailboxRowOperatorStatus(r));
    expect(t).not.toContain("EMAIL_PROVIDER");
    expect(t).not.toContain("Resend");
    expect(t).not.toContain("legacy");
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
    const status = mailboxRowOperatorStatus(row);
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
      });
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
    });
    expect(status.sublabel).toMatch(/expired/i);
  });
});
