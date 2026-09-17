import { describe, expect, it } from "vitest";

import { formatReplyCheckAttempt, summarizeReplyHealth } from "./reply-health";

describe("reply health", () => {
  it("warns only for connected mailboxes with a sync error", () => {
    expect(
      summarizeReplyHealth([
        {
          provider: "MICROSOFT",
          connectionStatus: "CONNECTED",
          lastSyncAt: "2026-09-17T10:00:00.000Z",
          lastError: "provider detail must stay private",
        },
        {
          provider: "GOOGLE",
          connectionStatus: "CONNECTION_ERROR",
          lastSyncAt: "2026-09-17T11:00:00.000Z",
          lastError: "auth detail",
        },
      ]),
    ).toEqual({
      connectedMailboxCount: 1,
      mailboxesNeedingAttention: 1,
      lastAttemptAt: "2026-09-17T10:00:00.000Z",
    });
  });

  it("uses the latest affected attempt without calling it a successful check", () => {
    const summary = summarizeReplyHealth([
      {
        provider: "MICROSOFT",
        connectionStatus: "CONNECTED",
        lastSyncAt: "2026-09-17T08:00:00.000Z",
        lastError: null,
      },
      {
        provider: "GOOGLE",
        connectionStatus: "CONNECTED",
        lastSyncAt: "2026-09-17T12:00:00.000Z",
        lastError: "temporary provider failure",
      },
    ]);

    expect(summary.lastAttemptAt).toBe("2026-09-17T12:00:00.000Z");
    expect(formatReplyCheckAttempt(summary.lastAttemptAt)).toBe(
      "Last reply check attempt 17 Sept, 13:00",
    );
  });

  it("does not let a newer healthy mailbox hide an older affected attempt", () => {
    const summary = summarizeReplyHealth([
      {
        provider: "MICROSOFT",
        connectionStatus: "CONNECTED",
        lastSyncAt: "2026-09-17T12:00:00.000Z",
        lastError: null,
      },
      {
        provider: "GOOGLE",
        connectionStatus: "CONNECTED",
        lastSyncAt: "2026-09-17T08:00:00.000Z",
        lastError: "temporary provider failure",
      },
    ]);

    expect(summary.lastAttemptAt).toBe("2026-09-17T08:00:00.000Z");
  });

  it("does not expose provider error text in the summary", () => {
    const summary = summarizeReplyHealth([
      {
        provider: "GOOGLE",
        connectionStatus: "CONNECTED",
        lastSyncAt: null,
        lastError: "secret provider response",
      },
    ]);

    expect(summary).not.toHaveProperty("lastError");
    expect(JSON.stringify(summary)).not.toContain("secret provider response");
  });
});
