import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * RULING 3 (Greg, 2026-08-24) — do-not-contact covers RELATED COMPANY domains,
 * but only ones a human has explicitly listed for that client.
 *
 * The case: a client says "do not contact BT" and hands over `bt.com`. Someone
 * at `bteurope.com` is on the prospect list. Greg's answer: do not email them.
 *
 * It CANNOT be inferred and must not be. `bteurope.com` shares no text with
 * `bt.com`, so any algorithm connecting them would also connect things that are
 * not related, and over-blocking a client's real prospects is its own failure.
 * A human types "BT" and lists the domains that belong to it.
 *
 * Three properties this file exists to hold:
 *   1. Suppression is TRANSITIVE across a family: if any member is suppressed
 *      for this client, every member is.
 *   2. It is PER CLIENT. One client's view of who BT is says nothing about
 *      another's, and a family in client A must never affect client B.
 *   3. It FAILS CLOSED on the SEND path, not just at import — a family entry
 *      added today must protect a contact loaded last month, because clients
 *      hand over updated do-not-contact sheets weekly or monthly.
 *
 * The fake below is table-backed rather than a canned return value, so the test
 * is not coupled to the shape of the queries the guard happens to issue.
 */
const { domainRows, emailRows, familyRows } = vi.hoisted(() => ({
  domainRows: [] as { clientId: string; domain: string }[],
  emailRows: [] as { clientId: string; email: string }[],
  familyRows: [] as { clientId: string; label: string; domain: string }[],
}));

type Where = {
  where?: {
    clientId?: string;
    domain?: string | { in?: string[] };
    label?: string | { in?: string[] };
    clientId_domain?: { clientId: string; domain: string };
    clientId_email?: { clientId: string; email: string };
  };
  select?: unknown;
};

const wanted = (v: unknown): string[] =>
  typeof v === "object" && v !== null && "in" in (v as Record<string, unknown>)
    ? ((v as { in?: string[] }).in ?? [])
    : typeof v === "string"
      ? [v]
      : [];

function matchDomains(a: Where) {
  const w = a.where ?? {};
  if (w.clientId_domain) {
    const k = w.clientId_domain;
    return domainRows.filter(
      (r) => r.clientId === k.clientId && r.domain === k.domain,
    );
  }
  const ds = wanted(w.domain);
  return domainRows.filter(
    (r) => r.clientId === w.clientId && (ds.length === 0 || ds.includes(r.domain)),
  );
}

function matchFamilies(a: Where) {
  const w = a.where ?? {};
  const ds = wanted(w.domain);
  const ls = wanted(w.label);
  return familyRows.filter(
    (r) =>
      r.clientId === w.clientId &&
      (ds.length === 0 || ds.includes(r.domain)) &&
      (ls.length === 0 || ls.includes(r.label)),
  );
}

vi.mock("@/lib/db", () => ({
  prisma: {
    suppressedEmail: {
      findUnique: async (a: Where) => {
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
      findUnique: async (a: Where) => matchDomains(a)[0] ?? null,
      findFirst: async (a: Where) => matchDomains(a)[0] ?? null,
      findMany: async (a: Where) => matchDomains(a),
    },
    suppressedDomainFamily: {
      findFirst: async (a: Where) => matchFamilies(a)[0] ?? null,
      findMany: async (a: Where) => matchFamilies(a),
    },
  },
}));

import { evaluateSuppression } from "./suppression-guard";

const CLIENT = "client-1";
const OTHER = "client-2";

beforeEach(() => {
  emailRows.length = 0;
  domainRows.length = 0;
  familyRows.length = 0;

  // The client has asked us not to contact BT, and gave us bt.com.
  domainRows.push({ clientId: CLIENT, domain: "bt.com" });
  // A human has listed the domains that belong to BT, for THIS client only.
  familyRows.push(
    { clientId: CLIENT, label: "BT", domain: "bt.com" },
    { clientId: CLIENT, label: "BT", domain: "bteurope.com" },
    { clientId: CLIENT, label: "BT", domain: "openreach.co.uk" },
  );
});

describe("a suppressed domain covers the rest of its explicitly-listed family", () => {
  it("THE CASE: bt.com is suppressed, so bteurope.com is blocked too", async () => {
    const d = await evaluateSuppression(CLIENT, "someone@bteurope.com");
    expect(d.suppressed).toBe(true);
    expect(d.reason).toBe("domain_family");
    expect(d.matchedDomain).toBe("bteurope.com");
    expect(d.matchedFamilyLabel).toBe("BT");
  });

  it("blocks any other member of the same family", async () => {
    const d = await evaluateSuppression(CLIENT, "person@openreach.co.uk");
    expect(d).toMatchObject({ suppressed: true, reason: "domain_family" });
  });

  it("still blocks the originally suppressed domain as a plain domain hit", async () => {
    const d = await evaluateSuppression(CLIENT, "person@bt.com");
    expect(d).toMatchObject({ suppressed: true, reason: "domain_list" });
  });

  it("covers subdomains of a family member too", async () => {
    const d = await evaluateSuppression(CLIENT, "person@mail.bteurope.com");
    expect(d).toMatchObject({ suppressed: true, reason: "domain_family" });
  });
});

describe("it must NOT over-block", () => {
  it("a family whose members are NONE of them suppressed blocks nothing", async () => {
    // Someone listed the Vodafone family but never suppressed Vodafone.
    familyRows.push(
      { clientId: CLIENT, label: "Vodafone", domain: "vodafone.com" },
      { clientId: CLIENT, label: "Vodafone", domain: "vodafone.co.uk" },
    );
    const d = await evaluateSuppression(CLIENT, "person@vodafone.co.uk");
    expect(d).toMatchObject({ suppressed: false, reason: "none" });
  });

  it("a domain in no family at all is unaffected", async () => {
    const d = await evaluateSuppression(CLIENT, "person@example.com");
    expect(d).toMatchObject({ suppressed: false, reason: "none" });
  });

  it("a lookalike is still not a member — membership is a listed fact, not a string match", async () => {
    const d = await evaluateSuppression(CLIENT, "person@notbt.com");
    expect(d).toMatchObject({ suppressed: false, reason: "none" });
  });
});

describe("families are per client and never leak", () => {
  it("another client's send is unaffected by this client's family", async () => {
    const d = await evaluateSuppression(OTHER, "someone@bteurope.com");
    expect(d).toMatchObject({ suppressed: false, reason: "none" });
  });

  it("another client suppressing bt.com does NOT inherit this client's family", async () => {
    // OTHER has suppressed bt.com but has listed no family of its own.
    domainRows.push({ clientId: OTHER, domain: "bt.com" });
    const direct = await evaluateSuppression(OTHER, "person@bt.com");
    expect(direct.suppressed).toBe(true); // its own plain suppression still works
    const related = await evaluateSuppression(OTHER, "person@bteurope.com");
    expect(related).toMatchObject({ suppressed: false, reason: "none" });
  });
});

describe("default empty — nothing changes until a human fills it in", () => {
  it("with no families listed, behaviour is exactly the plain domain rules", async () => {
    familyRows.length = 0;
    expect((await evaluateSuppression(CLIENT, "person@bt.com")).suppressed).toBe(true);
    expect(
      (await evaluateSuppression(CLIENT, "person@bteurope.com")).suppressed,
    ).toBe(false);
  });
});
