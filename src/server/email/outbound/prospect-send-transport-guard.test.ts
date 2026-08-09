import { describe, expect, it } from "vitest";

import { evaluateProspectSendTransport } from "./prospect-send-transport-guard";

const CONTACT = "ckcontact000000000000000";
const MAILBOX = "ckmailbox000000000000000";

describe("evaluateProspectSendTransport — fails closed", () => {
  it("BLOCKS a prospect-bound row with no connected mailbox", () => {
    const decision = evaluateProspectSendTransport({
      contactId: CONTACT,
      mailboxIdentityId: null,
    });

    expect(decision.block).toBe(true);
    if (decision.block) {
      expect(decision.code).toBe("NO_SENDING_MAILBOX");
      // The operator-facing reason must say plainly that nothing was sent —
      // the whole defect was the system claiming a send it never performed.
      expect(decision.reason).toMatch(/nothing was sent/i);
    }
  });

  it("blocks regardless of EMAIL_PROVIDER — the guard never consults it", () => {
    // The original hole was that an unset EMAIL_PROVIDER silently selects the
    // mock provider, which returns a synthetic success. A guard that trusted
    // EMAIL_PROVIDER would reopen exactly that hole the moment it was set.
    const original = process.env.EMAIL_PROVIDER;
    try {
      for (const value of [undefined, "", "mock", "resend"]) {
        if (value === undefined) delete process.env.EMAIL_PROVIDER;
        else process.env.EMAIL_PROVIDER = value;

        expect(
          evaluateProspectSendTransport({
            contactId: CONTACT,
            mailboxIdentityId: null,
          }).block,
        ).toBe(true);
      }
    } finally {
      if (original === undefined) delete process.env.EMAIL_PROVIDER;
      else process.env.EMAIL_PROVIDER = original;
    }
  });

  it("blocks when the mailbox id is an empty string, not just null", () => {
    expect(
      evaluateProspectSendTransport({
        contactId: CONTACT,
        mailboxIdentityId: "",
      }).block,
    ).toBe(true);
  });
});

describe("evaluateProspectSendTransport — allows legitimate traffic", () => {
  it("allows a prospect-bound row that HAS a connected mailbox", () => {
    expect(
      evaluateProspectSendTransport({
        contactId: CONTACT,
        mailboxIdentityId: MAILBOX,
      }),
    ).toEqual({ block: false });
  });

  it("allows legacy / platform mail, which carries no contact", () => {
    // Rows without a contactId are system or older non-mailbox mail. They are
    // not client outreach and must keep using the pluggable provider stack, so
    // this guard must not touch them.
    expect(
      evaluateProspectSendTransport({
        contactId: null,
        mailboxIdentityId: null,
      }),
    ).toEqual({ block: false });
  });

  it("allows platform mail that happens to have a mailbox identity", () => {
    expect(
      evaluateProspectSendTransport({
        contactId: null,
        mailboxIdentityId: MAILBOX,
      }),
    ).toEqual({ block: false });
  });
});

describe("evaluateProspectSendTransport — purity", () => {
  it("returns an identical decision for identical input", () => {
    // No hidden state: the same row must always produce the same decision, so
    // the guard cannot behave one way in dev and another in production.
    const row = { contactId: CONTACT, mailboxIdentityId: null };

    expect(evaluateProspectSendTransport(row)).toEqual(
      evaluateProspectSendTransport({ ...row }),
    );
  });

  it("does not mutate the row it is given", () => {
    const row = { contactId: CONTACT, mailboxIdentityId: null };
    evaluateProspectSendTransport(row);

    expect(row).toEqual({ contactId: CONTACT, mailboxIdentityId: null });
  });
});
