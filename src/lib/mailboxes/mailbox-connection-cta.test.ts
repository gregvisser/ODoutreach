import { describe, expect, it } from "vitest";

import {
  mailboxConnectActionLabel,
  mailboxConnectActionPlacement,
} from "./mailbox-connection-cta";

const NOW = new Date("2026-09-23T12:00:00.000Z");

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString();
}

function base(overrides: Partial<Parameters<typeof mailboxConnectActionPlacement>[0]> = {}) {
  return {
    provider: "MICROSOFT" as const,
    connectionStatus: "CONNECTED" as const,
    connectedAt: daysAgo(1),
    oauthStateExpiresAt: null,
    isActive: true,
    workspaceRemovedAt: null,
    ...overrides,
  };
}

describe("mailboxConnectActionPlacement — healthy connected mailboxes", () => {
  it("tucks Microsoft Reconnect under Advanced when Connected", () => {
    expect(mailboxConnectActionPlacement(base(), NOW)).toBe("advanced");
  });

  it("tucks Google Reconnect under Advanced when the seven-day clock is ok", () => {
    expect(
      mailboxConnectActionPlacement(
        base({ provider: "GOOGLE", connectedAt: daysAgo(2) }),
        NOW,
      ),
    ).toBe("advanced");
  });
});

describe("mailboxConnectActionPlacement — when Reconnect must stay primary", () => {
  it("keeps Connect primary for DRAFT and CONNECTION_ERROR rows", () => {
    expect(mailboxConnectActionPlacement(base({ connectionStatus: "DRAFT" }), NOW)).toBe(
      "primary",
    );
    expect(
      mailboxConnectActionPlacement(base({ connectionStatus: "CONNECTION_ERROR" }), NOW),
    ).toBe("primary");
  });

  it("keeps Connect primary for DISCONNECTED rows", () => {
    expect(
      mailboxConnectActionPlacement(base({ connectionStatus: "DISCONNECTED" }), NOW),
    ).toBe("primary");
  });

  it("promotes Google Reconnect when the token is due within two days", () => {
    expect(
      mailboxConnectActionPlacement(
        base({ provider: "GOOGLE", connectedAt: daysAgo(5) }),
        NOW,
      ),
    ).toBe("primary");
  });

  it("promotes Google Reconnect when the token is overdue", () => {
    expect(
      mailboxConnectActionPlacement(
        base({ provider: "GOOGLE", connectedAt: daysAgo(8) }),
        NOW,
      ),
    ).toBe("primary");
  });

  it("promotes Google Reconnect when connectedAt is missing", () => {
    expect(
      mailboxConnectActionPlacement(
        base({ provider: "GOOGLE", connectedAt: null }),
        NOW,
      ),
    ).toBe("primary");
  });
});

describe("mailboxConnectActionLabel", () => {
  it("says Reconnect only for CONNECTED rows", () => {
    expect(mailboxConnectActionLabel(base(), NOW)).toBe("Reconnect");
    expect(mailboxConnectActionLabel(base({ connectionStatus: "DRAFT" }), NOW)).toBe(
      "Connect",
    );
  });
});
