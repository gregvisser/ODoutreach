import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A suppressed domain must cover its subdomains.
 *
 * Suppressing `bt.com` and then emailing `someone@newsletter.bt.com` is a send
 * to a party who has asked not to be contacted. Almost nobody who writes
 * "bt.com" on a do-not-contact list means "the apex only" — and under UK PECR
 * the obligation attaches to the organisation, not to the exact hostname a
 * mail server happens to use.
 *
 * NOT covered here, deliberately: whether "do not contact BT" also covers a
 * RELATED company domain such as `bteurope.com`. That is a business rule and a
 * client decision, not something the code may infer. See the note in
 * `suppressionDomainCandidates`.
 *
 * The fake below is backed by a table rather than a canned return value, so
 * this test is not coupled to whether the guard uses findUnique or findFirst.
 */
const { domainRows, emailRows } = vi.hoisted(() => ({
  domainRows: [] as { clientId: string; domain: string }[],
  emailRows: [] as { clientId: string; email: string }[],
}));

type WhereArg = {
  where?: {
    clientId?: string;
    domain?: string | { in?: string[] };
    clientId_domain?: { clientId: string; domain: string };
    clientId_email?: { clientId: string; email: string };
  };
};

function matchDomains(args: WhereArg) {
  const w = args.where ?? {};
  if (w.clientId_domain) {
    const { clientId, domain } = w.clientId_domain;
    return domainRows.filter(
      (r) => r.clientId === clientId && r.domain === domain,
    );
  }
  const wanted =
    typeof w.domain === "object" && w.domain?.in
      ? w.domain.in
      : typeof w.domain === "string"
        ? [w.domain]
        : [];
  return domainRows.filter(
    (r) => r.clientId === w.clientId && wanted.includes(r.domain),
  );
}

vi.mock("@/lib/db", () => ({
  prisma: {
    suppressedEmail: {
      findUnique: async (a: WhereArg) => {
        const k = a.where?.clientId_email;
        if (!k) return null;
        return (
          emailRows.find(
            (r) => r.clientId === k.clientId && r.email === k.email,
          ) ?? null
        );
      },
    },
    suppressedDomain: {
      findUnique: async (a: WhereArg) => matchDomains(a)[0] ?? null,
      findFirst: async (a: WhereArg) => matchDomains(a)[0] ?? null,
      findMany: async (a: WhereArg) => matchDomains(a),
    },
  },
}));

import { evaluateSuppression } from "./suppression-guard";

const CLIENT = "client-1";

beforeEach(() => {
  emailRows.length = 0;
  domainRows.length = 0;
  // The client has asked us not to contact BT.
  domainRows.push({ clientId: CLIENT, domain: "bt.com" });
});

describe("a suppressed domain covers its subdomains", () => {
  it("blocks the apex itself", async () => {
    const d = await evaluateSuppression(CLIENT, "person@bt.com");
    expect(d).toMatchObject({ suppressed: true, reason: "domain_list" });
    expect(d.matchedDomain).toBe("bt.com");
  });

  it("blocks a subdomain", async () => {
    const d = await evaluateSuppression(CLIENT, "person@newsletter.bt.com");
    expect(d).toMatchObject({ suppressed: true, reason: "domain_list" });
    expect(d.matchedDomain).toBe("bt.com");
  });

  it("blocks a deep subdomain", async () => {
    const d = await evaluateSuppression(CLIENT, "person@mail.corp.bt.com");
    expect(d).toMatchObject({ suppressed: true, reason: "domain_list" });
    expect(d.matchedDomain).toBe("bt.com");
  });

  it("is case- and whitespace-insensitive", async () => {
    const d = await evaluateSuppression(CLIENT, "  Person@Newsletter.BT.com ");
    expect(d.suppressed).toBe(true);
  });
});

describe("it must NOT over-block", () => {
  it("does not block a lookalike that merely ends in the same letters", async () => {
    const d = await evaluateSuppression(CLIENT, "person@notbt.com");
    expect(d).toMatchObject({ suppressed: false, reason: "none" });
  });

  it("does not block a domain that only contains the suppressed one as a prefix", async () => {
    // `bt.com.evil.net` is registered under evil.net and is NOT BT.
    const d = await evaluateSuppression(CLIENT, "person@bt.com.evil.net");
    expect(d).toMatchObject({ suppressed: false, reason: "none" });
  });

  it("does not block an unrelated domain", async () => {
    const d = await evaluateSuppression(CLIENT, "person@example.com");
    expect(d).toMatchObject({ suppressed: false, reason: "none" });
  });

  it("does not leak across tenants", async () => {
    const d = await evaluateSuppression("other-client", "person@newsletter.bt.com");
    expect(d).toMatchObject({ suppressed: false, reason: "none" });
  });
});
