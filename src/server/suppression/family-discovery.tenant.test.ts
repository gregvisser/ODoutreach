import { describe, expect, it } from "vitest";

import {
  AUTO_BLOCK_MAX_CONTACTS,
  planFamilyProposals,
  tenantLink,
  type DiscoveredLink,
} from "@/server/suppression/family-discovery";

/**
 * THE SIGNAL THE CLIENT WAS PROMISED: two companies sharing one Microsoft 365
 * tenant.
 *
 * Every tenant id below was READ LIVE from
 * `https://login.microsoftonline.com/<domain>/v2.0/.well-known/openid-configuration`
 * on 2026-08-27, not invented. That endpoint needs no authentication and no
 * Microsoft Graph token — see `family-tenant.ts` for why Graph is the wrong
 * door.
 *
 * The two facts that matter, both measured:
 *
 *  * `halifax.co.uk`, `bankofscotland.co.uk` and `lloydsbanking.com` all return
 *    tenant `3ded2960-…`. Three unrelated-LOOKING names, one organisation. This
 *    is precisely the `bt.com` / `bteurope.com` class of link that RULING 3
 *    said could never be inferred — and it is not being inferred here, it is
 *    being read from something the company itself asserted to Microsoft.
 *  * `gmail.com`, `hotmail.com`, `live.com` AND `yahoo.co.uk` all return tenant
 *    `9cd80435-…`. Four unrelated consumer providers in one tenant. That is a
 *    REAL false positive in this signal, and the test below pins that the
 *    existing consumer-mailbox guard kills it.
 */

/** Lloyds Banking Group. Read live 2026-08-27. */
const LLOYDS = "3ded2960-214a-46ff-8cf4-611f125e2398";
/** Microsoft's shared consumer tenant. Read live 2026-08-27. */
const CONSUMER = "9cd80435-793b-4f48-844b-6b3f37d1c1f3";
/** Centrica. Read live 2026-08-27. */
const CENTRICA = "a603898f-7de2-45ba-b67d-d35fb519b2cf";

describe("tenantLink", () => {
  it("links two domains that resolve to the same tenant", () => {
    const link = tenantLink({
      proposedDomain: "halifax.co.uk",
      proposedTenantId: LLOYDS,
      seedDomain: "bankofscotland.co.uk",
      seedTenantId: LLOYDS,
    });

    expect(link).not.toBeNull();
    expect(link?.source).toBe("MICROSOFT_TENANT");
    expect(link?.seedDomain).toBe("bankofscotland.co.uk");
    expect(link?.proposedDomain).toBe("halifax.co.uk");
    // The evidence a person reads must contain the thing that was actually
    // matched, or "check the evidence" is not a real instruction.
    expect(link?.evidence).toContain(LLOYDS);
  });

  it("does not link domains in different tenants", () => {
    expect(
      tenantLink({
        proposedDomain: "halifax.co.uk",
        proposedTenantId: LLOYDS,
        seedDomain: "centrica.com",
        seedTenantId: CENTRICA,
      }),
    ).toBeNull();
  });

  it("does not link when either side has no tenant at all", () => {
    // bteurope.com returns AADSTS90002 "Tenant not found" — measured. A domain
    // outside Microsoft 365 must produce silence, never a match.
    expect(
      tenantLink({
        proposedDomain: "bteurope.com",
        proposedTenantId: null,
        seedDomain: "bt.com",
        seedTenantId: "a7f35688-9c00-4d5e-ba41-29f146377ab0",
      }),
    ).toBeNull();
    expect(
      tenantLink({
        proposedDomain: "halifax.co.uk",
        proposedTenantId: LLOYDS,
        seedDomain: "somewhere.example",
        seedTenantId: null,
      }),
    ).toBeNull();
  });

  it("does not link a domain to itself", () => {
    expect(
      tenantLink({
        proposedDomain: "halifax.co.uk",
        proposedTenantId: LLOYDS,
        seedDomain: "www.halifax.co.uk",
        seedTenantId: LLOYDS,
      }),
    ).toBeNull();
  });
});

describe("planFamilyProposals — the measured consumer-tenant false positive", () => {
  it("refuses gmail.com and yahoo.co.uk even though they really do share a tenant", () => {
    const plans = planFamilyProposals({
      links: [
        tenantLink({
          proposedDomain: "gmail.com",
          proposedTenantId: CONSUMER,
          seedDomain: "yahoo.co.uk",
          seedTenantId: CONSUMER,
        })!,
      ],
      existing: [],
    });

    expect(plans).toHaveLength(1);
    expect(plans[0]!.kind).toBe("skip");
    expect(plans[0]).toMatchObject({ reason: "consumer_mailbox_host" });
  });
});

const tenantPair = (proposed: string, seed: string): DiscoveredLink =>
  tenantLink({
    proposedDomain: proposed,
    proposedTenantId: LLOYDS,
    seedDomain: seed,
    seedTenantId: LLOYDS,
  })!;

describe("planFamilyProposals — which links may block WITHOUT being asked", () => {
  it("marks a lone tenant match as auto-blockable", () => {
    const plans = planFamilyProposals({
      links: [tenantPair("halifax.co.uk", "bankofscotland.co.uk")],
      existing: [],
      contactsByDomain: new Map([["halifax.co.uk", 3]]),
    });

    expect(plans).toEqual([
      expect.objectContaining({ kind: "create", autoBlock: true }),
    ]);
  });

  it("never auto-blocks a DMARC or SPF link, however clean", () => {
    const dmarc: DiscoveredLink = {
      seedDomain: "bt.com",
      proposedDomain: "openreach.co.uk",
      source: "DMARC_RUA",
      evidence: "v=DMARC1; p=reject; rua=mailto:dmarc@bt.com",
    };

    const plans = planFamilyProposals({
      links: [dmarc],
      existing: [],
      contactsByDomain: new Map([["openreach.co.uk", 1]]),
    });

    expect(plans).toEqual([
      expect.objectContaining({ kind: "create", autoBlock: false }),
    ]);
  });

  it("does not auto-block when two companies share the tenant — that is the MSP shape", () => {
    // A small IT provider putting two unrelated customers in its own tenant
    // looks EXACTLY like a corporate group from the outside. Unmeasured against
    // production, so a cluster stays a question.
    const plans = planFamilyProposals({
      links: [
        tenantPair("halifax.co.uk", "lloydsbanking.com"),
        tenantPair("bankofscotland.co.uk", "lloydsbanking.com"),
      ],
      existing: [],
      contactsByDomain: new Map([
        ["halifax.co.uk", 1],
        ["bankofscotland.co.uk", 1],
      ]),
    });

    expect(plans).toHaveLength(2);
    for (const plan of plans) {
      expect(plan).toMatchObject({ kind: "create", autoBlock: false });
    }
  });

  it("does not auto-block a match that would silently remove more than the blast cap", () => {
    const plans = planFamilyProposals({
      links: [tenantPair("halifax.co.uk", "bankofscotland.co.uk")],
      existing: [],
      contactsByDomain: new Map([
        ["halifax.co.uk", AUTO_BLOCK_MAX_CONTACTS + 1],
      ]),
    });

    expect(plans).toEqual([
      expect.objectContaining({ kind: "create", autoBlock: false }),
    ]);
  });

  it("still refuses a tenant match a person has already rejected", () => {
    const plans = planFamilyProposals({
      links: [tenantPair("halifax.co.uk", "bankofscotland.co.uk")],
      existing: [
        {
          seedDomain: "bankofscotland.co.uk",
          proposedDomain: "halifax.co.uk",
          status: "REJECTED",
        },
      ],
      contactsByDomain: new Map([["halifax.co.uk", 1]]),
    });

    expect(plans).toEqual([
      expect.objectContaining({ kind: "skip", reason: "rejected_tombstone" }),
    ]);
  });
});
