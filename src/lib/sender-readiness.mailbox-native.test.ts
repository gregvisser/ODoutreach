import { describe, expect, it, beforeEach, afterEach } from "vitest";

import { describeSenderReadiness } from "./sender-readiness";

describe("describeSenderReadiness (mailbox-native outreach)", () => {
  const baseM = (over: Partial<{ connectionStatus: string; canSend: boolean }> = {}) => ({
    email: "rep@clientdomain.example",
    isActive: true,
    connectionStatus: "CONNECTED" as const,
    canSend: true,
    isSendingEnabled: true,
    ...over,
  });

  let envProvider: string | undefined;

  beforeEach(() => {
    envProvider = process.env.EMAIL_PROVIDER;
  });

  afterEach(() => {
    if (envProvider === undefined) {
      delete process.env.EMAIL_PROVIDER;
    } else {
      process.env.EMAIL_PROVIDER = envProvider;
    }
    vi.unstubAllEnvs();
  });

  it("does not headline mock_dev when a mailbox is eligible, even if EMAIL_PROVIDER is mock", () => {
    process.env.EMAIL_PROVIDER = "mock";
    const r = describeSenderReadiness({
      defaultSenderEmail: null,
      senderIdentityStatus: "NOT_SET",
      outreachMailboxes: [baseM()],
    });
    expect(r.outreachSendsVia).toBe("mailboxes");
    expect(r.headline).toBe("mailbox_outreach_ready");
    expect(r.summary.toLowerCase()).toContain("microsoft 365 or google");
  });

  it("keeps global mock headline for unassessed (no mailbox rows) legacy-only view", () => {
    process.env.EMAIL_PROVIDER = "mock";
    const r = describeSenderReadiness({
      defaultSenderEmail: "ops@x.com",
      senderIdentityStatus: "VERIFIED_READY",
      // outreach mailboxes not passed
    });
    expect(r.outreachSendsVia).toBe("unassessed");
    expect(r.headline).toBe("mock_dev");
  });
});
