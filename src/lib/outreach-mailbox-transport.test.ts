import { describe, expect, it } from "vitest";

import { summarizeOutreachMailboxes } from "./outreach-mailbox-transport";

describe("summarizeOutreachMailboxes", () => {
  it("returns hasMailboxNativeOutreachPath when at least one row is fully eligible", () => {
    const s = summarizeOutreachMailboxes([
      {
        email: "a@x.com",
        isActive: true,
        connectionStatus: "CONNECTED",
        canSend: true,
        isSendingEnabled: true,
      },
      {
        email: "b@x.com",
        isActive: true,
        connectionStatus: "ERROR",
        canSend: true,
        isSendingEnabled: true,
      },
    ]);
    expect(s.hasMailboxNativeOutreachPath).toBe(true);
    expect(s.eligibleCount).toBe(1);
    expect(s.hasAnyMailboxRow).toBe(true);
    expect(s.firstEligibleMailboxEmail).toBe("a@x.com");
  });

  it("is false when rows exist but none are eligible", () => {
    const s = summarizeOutreachMailboxes([
      {
        email: "a@x.com",
        isActive: true,
        connectionStatus: "ERROR",
        canSend: true,
        isSendingEnabled: true,
      },
    ]);
    expect(s.hasMailboxNativeOutreachPath).toBe(false);
    expect(s.hasAnyMailboxRow).toBe(true);
    expect(s.eligibleCount).toBe(0);
  });
});
