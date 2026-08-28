import { describe, expect, it } from "vitest";

import {
  isMailboxSendingCredentialLive,
  isStrandedByAbandonedConnect,
  shouldPreserveMailboxCredentialOnConnect,
  type MailboxConnectCredentialRow,
} from "@/lib/mailboxes/mailbox-connect-credential";

function row(
  over: Partial<MailboxConnectCredentialRow> = {},
): MailboxConnectCredentialRow {
  return {
    connectionStatus: "CONNECTED",
    hasStoredCredential: true,
    isActive: true,
    workspaceRemovedAt: null,
    ...over,
  };
}

describe("isMailboxSendingCredentialLive", () => {
  it("is true only when the row is CONNECTED and a credential is stored", () => {
    expect(isMailboxSendingCredentialLive(row())).toBe(true);
  });

  it("is false when the credential is gone, even on a CONNECTED row", () => {
    expect(
      isMailboxSendingCredentialLive(row({ hasStoredCredential: false })),
    ).toBe(false);
  });

  it.each(["DRAFT", "PENDING_CONNECTION", "CONNECTION_ERROR", "DISCONNECTED"] as const)(
    "is false for %s even with a stored credential, because sending-policy refuses on status first",
    (connectionStatus) => {
      expect(isMailboxSendingCredentialLive(row({ connectionStatus }))).toBe(false);
    },
  );

  it("is false for an inactive or workspace-removed mailbox", () => {
    expect(isMailboxSendingCredentialLive(row({ isActive: false }))).toBe(false);
    expect(
      isMailboxSendingCredentialLive(
        row({ workspaceRemovedAt: new Date("2026-08-01T00:00:00.000Z") }),
      ),
    ).toBe(false);
  });
});

describe("shouldPreserveMailboxCredentialOnConnect", () => {
  it("REFUSES to clear a mailbox that is sending today", () => {
    // The defect this module exists for: one click on Connect against this row
    // used to delete its refresh token and stop it sending, before the operator
    // had even reached the provider.
    expect(shouldPreserveMailboxCredentialOnConnect(row())).toBe(true);
  });

  it.each([
    ["DRAFT", true],
    ["DISCONNECTED", false],
    ["CONNECTION_ERROR", false],
    ["PENDING_CONNECTION", false],
  ] as const)(
    "clears as before for %s — there is no working credential to protect",
    (connectionStatus, hasStoredCredential) => {
      expect(
        shouldPreserveMailboxCredentialOnConnect(
          row({ connectionStatus, hasStoredCredential }),
        ),
      ).toBe(false);
    },
  );

  it("clears a CONNECTED row whose credential has already gone", () => {
    // Nothing is being protected here, and leaving it CONNECTED would tell the
    // operator it can send when it cannot.
    expect(
      shouldPreserveMailboxCredentialOnConnect(row({ hasStoredCredential: false })),
    ).toBe(false);
  });
});

describe("isStrandedByAbandonedConnect", () => {
  it("spots the exact state an abandoned Connect leaves behind", () => {
    expect(
      isStrandedByAbandonedConnect(
        row({ connectionStatus: "PENDING_CONNECTION", hasStoredCredential: false }),
      ),
    ).toBe(true);
  });

  it("does not count a pending row that still holds its credential", () => {
    expect(
      isStrandedByAbandonedConnect(
        row({ connectionStatus: "PENDING_CONNECTION", hasStoredCredential: true }),
      ),
    ).toBe(false);
  });

  it.each(["DRAFT", "CONNECTED", "CONNECTION_ERROR", "DISCONNECTED"] as const)(
    "does not count %s — those are not the abandoned-connect state",
    (connectionStatus) => {
      expect(
        isStrandedByAbandonedConnect(row({ connectionStatus, hasStoredCredential: false })),
      ).toBe(false);
    },
  );

  it("does not count inactive or removed mailboxes as an outage", () => {
    const stranded = { connectionStatus: "PENDING_CONNECTION", hasStoredCredential: false } as const;
    expect(isStrandedByAbandonedConnect(row({ ...stranded, isActive: false }))).toBe(false);
    expect(
      isStrandedByAbandonedConnect(
        row({ ...stranded, workspaceRemovedAt: new Date("2026-08-01T00:00:00.000Z") }),
      ),
    ).toBe(false);
  });
});
