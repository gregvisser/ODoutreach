import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearMailRouteCache,
  isRecipientVerificationEnabled,
  lookupMailRoute,
  lookupMailRouteCached,
  lookupMailRouteForAddress,
  type MailRouteResolver,
} from "./recipient-mail-route";

/**
 * These tests inject a fake resolver, so nothing here touches the network and
 * the suite cannot go red because a real domain changed its DNS.
 */

function dnsError(code: string): Error & { code: string } {
  return Object.assign(new Error(`queryMx ${code}`), { code });
}

function resolver(over: Partial<MailRouteResolver> = {}): MailRouteResolver {
  return {
    resolveMx: vi.fn(async () => [{ exchange: "mx.example.com", priority: 10 }]),
    resolve4: vi.fn(async () => ["1.2.3.4"]),
    resolve6: vi.fn(async () => []),
    ...over,
  };
}

beforeEach(() => {
  clearMailRouteCache();
});

describe("reading what DNS actually said", () => {
  it("an MX record means the domain can receive mail", async () => {
    const r = await lookupMailRoute("example.com", resolver());
    expect(r).toEqual({ status: "has_route", via: "mx" });
  });

  it("no MX but an A record still means it can receive mail (RFC 5321 §5.1)", async () => {
    const r = await lookupMailRoute(
      "old-company.com",
      resolver({ resolveMx: vi.fn(async () => { throw dnsError("ENODATA"); }) }),
    );
    expect(r).toEqual({ status: "has_route", via: "address_record" });
  });

  it("a null MX (RFC 7505) is an explicit refusal and does NOT fall back to A", async () => {
    // "." as the exchange means "this domain accepts no mail". A fallback here
    // would send to a domain that has formally told us not to.
    const resolve4 = vi.fn(async () => ["1.2.3.4"]);
    const r = await lookupMailRoute(
      "no-mail.example",
      resolver({
        resolveMx: vi.fn(async () => [{ exchange: ".", priority: 0 }]),
        resolve4,
      }),
    );
    expect(r).toEqual({ status: "no_route" });
    expect(resolve4).not.toHaveBeenCalled();
  });

  it("nothing resolving at all means the domain does not exist", async () => {
    const r = await lookupMailRoute(
      "gmial.com",
      resolver({
        resolveMx: vi.fn(async () => { throw dnsError("ENOTFOUND"); }),
        resolve4: vi.fn(async () => { throw dnsError("ENOTFOUND"); }),
        resolve6: vi.fn(async () => { throw dnsError("ENOTFOUND"); }),
      }),
    );
    expect(r).toEqual({ status: "domain_missing" });
  });

  it("a domain that resolves but publishes no mail route is no_route", async () => {
    const r = await lookupMailRoute(
      "parked.example",
      resolver({
        resolveMx: vi.fn(async () => { throw dnsError("ENODATA"); }),
        resolve4: vi.fn(async () => { throw dnsError("ENODATA"); }),
        resolve6: vi.fn(async () => { throw dnsError("ENODATA"); }),
      }),
    );
    expect(r).toEqual({ status: "no_route" });
  });
});

describe("a broken resolver is never mistaken for a bad recipient", () => {
  it("SERVFAIL on MX reports unknown, not a dead domain", async () => {
    const r = await lookupMailRoute(
      "real-company.com",
      resolver({ resolveMx: vi.fn(async () => { throw dnsError("ESERVFAIL"); }) }),
    );
    expect(r.status).toBe("unknown");
  });

  it("a timeout on the address fallback reports unknown too", async () => {
    const r = await lookupMailRoute(
      "real-company.com",
      resolver({
        resolveMx: vi.fn(async () => { throw dnsError("ENODATA"); }),
        resolve4: vi.fn(async () => { throw dnsError("ETIMEOUT"); }),
      }),
    );
    expect(r.status).toBe("unknown");
  });
});

describe("the cache", () => {
  it("asks DNS once for the same domain", async () => {
    const r = resolver();
    await lookupMailRouteCached("example.com", 1000, r);
    await lookupMailRouteCached("example.com", 2000, r);
    expect(r.resolveMx).toHaveBeenCalledTimes(1);
  });

  it("re-asks after the entry expires", async () => {
    const r = resolver();
    await lookupMailRouteCached("example.com", 0, r);
    await lookupMailRouteCached("example.com", 7 * 60 * 60 * 1000, r);
    expect(r.resolveMx).toHaveBeenCalledTimes(2);
  });

  it("never caches an unknown — one bad moment must not spread", async () => {
    // If a resolver hiccup were cached, every send in the following window
    // would inherit it. This is the assertion that stops that.
    const r = resolver({ resolveMx: vi.fn(async () => { throw dnsError("ESERVFAIL"); }) });
    await lookupMailRouteCached("real-company.com", 1000, r);
    await lookupMailRouteCached("real-company.com", 1001, r);
    expect(r.resolveMx).toHaveBeenCalledTimes(2);
  });

  it("holds a negative answer for less time than a positive one", async () => {
    // A domain set up five minutes ago must not stay blocked for six hours.
    const bad = resolver({
      resolveMx: vi.fn(async () => { throw dnsError("ENODATA"); }),
      resolve4: vi.fn(async () => { throw dnsError("ENODATA"); }),
      resolve6: vi.fn(async () => { throw dnsError("ENODATA"); }),
    });
    await lookupMailRouteCached("new-domain.com", 0, bad);
    await lookupMailRouteCached("new-domain.com", 31 * 60 * 1000, bad);
    expect(bad.resolveMx).toHaveBeenCalledTimes(2);
  });
});

describe("address entry point", () => {
  it("looks up the domain half of the address", async () => {
    const r = resolver();
    const route = await lookupMailRouteForAddress("Someone@Example.COM", 1000, r);
    expect(route).toEqual({ status: "has_route", via: "mx" });
    expect(r.resolveMx).toHaveBeenCalledWith("example.com");
  });

  it("returns null when there is no domain to look up", async () => {
    const r = resolver();
    expect(await lookupMailRouteForAddress("not an address", 1000, r)).toBeNull();
    expect(r.resolveMx).not.toHaveBeenCalled();
  });
});

describe("the kill switch", () => {
  const saved = process.env.RECIPIENT_VERIFICATION_ENABLED;
  afterEach(() => {
    if (saved === undefined) delete process.env.RECIPIENT_VERIFICATION_ENABLED;
    else process.env.RECIPIENT_VERIFICATION_ENABLED = saved;
  });

  it("is ON by default — this gate is meant to fire", async () => {
    delete process.env.RECIPIENT_VERIFICATION_ENABLED;
    expect(isRecipientVerificationEnabled()).toBe(true);
  });

  it("turns off only on an explicit false", async () => {
    process.env.RECIPIENT_VERIFICATION_ENABLED = "false";
    expect(isRecipientVerificationEnabled()).toBe(false);
    process.env.RECIPIENT_VERIFICATION_ENABLED = "true";
    expect(isRecipientVerificationEnabled()).toBe(true);
  });
});
