import { describe, expect, it } from "vitest";

import { describeOutboundProvider } from "@/lib/email/outbound-provider-copy";

/**
 * Row 111 finding 6 — the outbound email detail screen could show
 * "Provider: mock" with nothing on that screen explaining what it means.
 * "mock" is a developer word for a fake/test transport, so a reader could
 * reasonably worry the send never really went out — for ANY client. The
 * real explanation ("legacy/test rows with no mailbox attached") already
 * existed, but only on the Training > Mailboxes page, a screen away from
 * where the confusing word actually appears.
 */
describe("describeOutboundProvider (row 111 finding 6)", () => {
  it("explains 'mock' in place, instead of leaving the raw developer word bare", () => {
    const out = describeOutboundProvider("mock");
    expect(out.label).not.toBe("mock");
    expect(out.explanation).toMatch(/not sent through a client mailbox/i);
  });

  it("explains the dev-only simulate/replay provider names the same way", () => {
    for (const raw of ["dev_simulate", "dev_replay"]) {
      const out = describeOutboundProvider(raw);
      expect(out.explanation).toMatch(/not sent through a client mailbox/i);
    }
  });

  it("gives a real client mailbox send a plain provider name and no confusing explanation", () => {
    expect(describeOutboundProvider("microsoft_graph")).toEqual({
      label: "Microsoft (Outlook)",
      explanation: null,
    });
    expect(describeOutboundProvider("google_gmail")).toEqual({
      label: "Google (Gmail)",
      explanation: null,
    });
  });

  it("explains the legacy Resend path without implying it is the normal client path", () => {
    const out = describeOutboundProvider("resend");
    expect(out.explanation).toMatch(/legacy/i);
    expect(out.explanation).toMatch(/not.*client mailbox|not.*connected mailbox/i);
  });

  it("shows the em dash placeholder for a missing provider, same as today", () => {
    expect(describeOutboundProvider(null)).toEqual({ label: "—", explanation: null });
  });
});
