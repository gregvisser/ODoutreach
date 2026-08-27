import { describe, expect, it } from "vitest";

import {
  classifyRecipientAddress,
  type RecipientMailRoute,
} from "./recipient-verification-policy";

/**
 * The promise this pins down: an email is never handed to a provider when we
 * have PROVEN the recipient's domain cannot receive mail.
 *
 * The distinction that matters, and the one every test below circles, is
 * between "we know it cannot receive mail" and "we could not find out". The
 * first must block. The second must NOT block — a resolver having a bad
 * minute is not evidence about the recipient, and blocking on it would turn a
 * DNS blip into a silent send outage for a live client.
 */

const ROUTED: RecipientMailRoute = { status: "has_route", via: "mx" };

describe("addresses we can prove are undeliverable", () => {
  it("blocks a domain whose nameservers say it does not exist", () => {
    const d = classifyRecipientAddress({
      email: "someone@gmial.com",
      route: { status: "domain_missing" },
    });

    expect(d.verdict).toBe("block");
    expect(d.code).toBe("RECIPIENT_DOMAIN_DOES_NOT_EXIST");
  });

  it("blocks a real domain that publishes no mail destination at all", () => {
    // A parked or web-only domain: it resolves, but there is nowhere for a
    // message to land. Every send to it is a guaranteed hard bounce.
    const d = classifyRecipientAddress({
      email: "someone@parked.example",
      route: { status: "no_route" },
    });

    expect(d.verdict).toBe("block");
    expect(d.code).toBe("RECIPIENT_DOMAIN_CANNOT_RECEIVE_MAIL");
  });

  it("blocks a malformed address before it ever reaches DNS", () => {
    const d = classifyRecipientAddress({
      email: "not an address",
      route: null,
    });

    expect(d.verdict).toBe("block");
    expect(d.code).toBe("RECIPIENT_ADDRESS_MALFORMED");
  });

  it("gives a reason a non-coder can act on, not an error code", () => {
    const d = classifyRecipientAddress({
      email: "someone@gmial.com",
      route: { status: "domain_missing" },
    });

    expect(d.verdict).toBe("block");
    expect(d.reason).toMatch(/gmial\.com/);
    expect(d.reason).toMatch(/does not exist/i);
  });
});

describe("addresses we cannot prove anything about", () => {
  it("DEFERS rather than blocking when the lookup itself failed", () => {
    // The load-bearing test. A resolver timeout is not evidence that the
    // recipient is bad. Blocking here would fail an entire batch of good
    // addresses; sending here would defeat the gate. So: try again later.
    const d = classifyRecipientAddress({
      email: "someone@real-company.com",
      route: { status: "unknown", error: "queryMx ETIMEOUT" },
    });

    expect(d.verdict).toBe("defer");
    expect(d.code).toBe("RECIPIENT_VERIFICATION_UNAVAILABLE");
  });

  it("never reports a deferral as a permanent failure of the address", () => {
    const d = classifyRecipientAddress({
      email: "someone@real-company.com",
      route: { status: "unknown", error: "queryMx ESERVFAIL" },
    });

    expect(d.reason).not.toMatch(/does not exist|cannot receive/i);
  });
});

describe("good addresses are untouched", () => {
  it("sends when the domain has an MX record", () => {
    expect(classifyRecipientAddress({ email: "a@b.com", route: ROUTED }).verdict).toBe("send");
  });

  it("sends when the domain has no MX but does have an address record", () => {
    // RFC 5321 §5.1: with no MX, the A record is the implicit mail exchanger.
    // Treating that as undeliverable would block genuinely reachable domains.
    const d = classifyRecipientAddress({
      email: "a@b.com",
      route: { status: "has_route", via: "address_record" },
    });

    expect(d.verdict).toBe("send");
  });

  it("sends when verification is switched off entirely", () => {
    // The kill switch has to be honoured HERE, not only at the call site, so
    // there is one place that decides and it can be tested.
    const d = classifyRecipientAddress({
      email: "someone@gmial.com",
      route: { status: "domain_missing" },
      enabled: false,
    });

    expect(d.verdict).toBe("send");
  });
});
