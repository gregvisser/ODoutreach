import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  suppressedDomain: { findMany: vi.fn() },
  contact: { findMany: vi.fn() },
  suppressedDomainFamilyProposal: {
    findMany: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
  },
}));
vi.mock("@/lib/db", () => ({ prisma: prismaMock }));

import {
  discoverLinksForClient,
  persistProposalPlans,
  planClientFamilyProposals,
} from "./family-discovery-run";
import type { ProposalPlan } from "./family-discovery";

/**
 * The IO half of family discovery. DNS is injected so these are deterministic.
 *
 * The property that matters most here is the second line of defence on the
 * tombstone: the planner will never emit a write for a REJECTED pair, and the
 * update is ALSO scoped to `status: "PENDING"`, so a future planner bug still
 * cannot resurrect a link a person refused.
 */

const DNS: Record<string, string[]> = {
  // Openreach reports to BT. BT is suppressed. This is the real case.
  "_dmarc.openreach.co.uk": ["v=DMARC1; p=reject; rua=mailto:dmarc@bt.com"],
  "openreach.co.uk": ["v=spf1 include:spf.protection.outlook.com -all"],
  // Points at a vendor, which is not suppressed, so it must be discarded.
  "_dmarc.somecompany.co.uk": ["v=DMARC1; p=none; rua=mailto:x@dmarcian.com"],
  "somecompany.co.uk": ["v=spf1 -all"],
  // Uses include: of a suppressed domain — must NOT be read.
  "unrelated.co.uk": ["v=spf1 include:spf.protection.outlook.com -all"],
  "_dmarc.unrelated.co.uk": [],
};

const lookupTxt = async (name: string): Promise<string[]> => DNS[name] ?? [];

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.suppressedDomainFamilyProposal.create.mockResolvedValue({ id: "p1" });
  prismaMock.suppressedDomainFamilyProposal.updateMany.mockResolvedValue({ count: 1 });
});

describe("discoverLinksForClient", () => {
  it("keeps a link only when it points at a domain the client suppressed", async () => {
    const links = await discoverLinksForClient({
      contactDomains: ["openreach.co.uk", "somecompany.co.uk"],
      suppressedDomains: new Set(["bt.com", "outlook.com"]),
      lookupTxt,
    });
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      seedDomain: "bt.com",
      proposedDomain: "openreach.co.uk",
      source: "DMARC_RUA",
    });
  });

  it("skips a contact domain that is already suppressed", async () => {
    const links = await discoverLinksForClient({
      contactDomains: ["openreach.co.uk"],
      suppressedDomains: new Set(["bt.com", "openreach.co.uk"]),
      lookupTxt,
    });
    // Already blocked either way — there is nothing to ask.
    expect(links).toEqual([]);
  });

  it("never follows SPF include:, even to a suppressed domain", async () => {
    // outlook.com IS suppressed in this fixture, and unrelated.co.uk includes
    // it. Measured on production, this exact pattern linked 216 contact domains
    // to outlook.com.
    const links = await discoverLinksForClient({
      contactDomains: ["unrelated.co.uk"],
      suppressedDomains: new Set(["outlook.com"]),
      lookupTxt,
    });
    expect(links).toEqual([]);
  });

  it("returns nothing rather than throwing when DNS fails", async () => {
    const links = await discoverLinksForClient({
      contactDomains: ["a.co.uk", "b.co.uk"],
      suppressedDomains: new Set(["bt.com"]),
      lookupTxt: async () => {
        throw new Error("SERVFAIL");
      },
    });
    expect(links).toEqual([]);
  });
});

describe("planClientFamilyProposals reads, and does not write", () => {
  it("plans a proposal without touching the database", async () => {
    prismaMock.suppressedDomain.findMany.mockResolvedValue([{ domain: "bt.com" }]);
    prismaMock.contact.findMany.mockResolvedValue([{ emailDomain: "openreach.co.uk" }]);
    prismaMock.suppressedDomainFamilyProposal.findMany.mockResolvedValue([]);

    const result = await planClientFamilyProposals({ clientId: "c1", lookupTxt });

    expect(result.plans).toHaveLength(1);
    expect(result.plans[0]?.kind).toBe("create");
    expect(prismaMock.suppressedDomainFamilyProposal.create).not.toHaveBeenCalled();
    expect(prismaMock.suppressedDomainFamilyProposal.updateMany).not.toHaveBeenCalled();
  });

  it("honours an existing rejection end to end", async () => {
    prismaMock.suppressedDomain.findMany.mockResolvedValue([{ domain: "bt.com" }]);
    prismaMock.contact.findMany.mockResolvedValue([{ emailDomain: "openreach.co.uk" }]);
    prismaMock.suppressedDomainFamilyProposal.findMany.mockResolvedValue([
      { seedDomain: "bt.com", proposedDomain: "openreach.co.uk", status: "REJECTED" },
    ]);

    const result = await planClientFamilyProposals({ clientId: "c1", lookupTxt });

    expect(result.plans[0]?.kind).toBe("skip");
    if (result.plans[0]?.kind === "skip") {
      expect(result.plans[0].reason).toBe("rejected_tombstone");
    }
  });
});

describe("persistProposalPlans cannot resurrect a rejection", () => {
  it("writes nothing for a skip", async () => {
    const plans: ProposalPlan[] = [
      {
        kind: "skip",
        reason: "rejected_tombstone",
        link: {
          seedDomain: "bt.com",
          proposedDomain: "openreach.co.uk",
          source: "DMARC_RUA",
          evidence: "v=DMARC1; rua=mailto:d@bt.com",
        },
      },
    ];
    const result = await persistProposalPlans({ clientId: "c1", plans });
    expect(result).toEqual({ created: 0, refreshed: 0, skipped: 1 });
    expect(prismaMock.suppressedDomainFamilyProposal.create).not.toHaveBeenCalled();
    expect(prismaMock.suppressedDomainFamilyProposal.updateMany).not.toHaveBeenCalled();
  });

  it("scopes a refresh to PENDING, so even a planner bug cannot revive a rejection", async () => {
    // This is the second line of defence. If a future change made the planner
    // emit `refresh` for a REJECTED row, the WHERE clause still refuses it.
    const plans: ProposalPlan[] = [
      {
        kind: "refresh",
        fanIn: 1,
        link: {
          seedDomain: "bt.com",
          proposedDomain: "openreach.co.uk",
          source: "DMARC_RUA",
          evidence: "v=DMARC1; rua=mailto:d@bt.com",
        },
      },
    ];
    await persistProposalPlans({ clientId: "c1", plans });

    const call = prismaMock.suppressedDomainFamilyProposal.updateMany.mock.calls[0]?.[0] as {
      where: { status: string };
      data: Record<string, unknown>;
    };
    expect(call.where.status).toBe("PENDING");
    // And it must not be able to set the status at all.
    expect(Object.keys(call.data)).not.toContain("status");
  });

  it("creates a genuinely new proposal with its evidence and fan-in", async () => {
    const plans: ProposalPlan[] = [
      {
        kind: "create",
        fanIn: 2,
        link: {
          seedDomain: "bt.com",
          proposedDomain: "openreach.co.uk",
          source: "DMARC_RUA",
          evidence: "v=DMARC1; p=reject; rua=mailto:dmarc@bt.com",
        },
      },
    ];
    const result = await persistProposalPlans({ clientId: "c1", plans });
    expect(result.created).toBe(1);
    const data = prismaMock.suppressedDomainFamilyProposal.create.mock.calls[0]?.[0]
      .data as Record<string, unknown>;
    expect(data).toMatchObject({
      clientId: "c1",
      seedDomain: "bt.com",
      proposedDomain: "openreach.co.uk",
      source: "DMARC_RUA",
      fanIn: 2,
    });
    // The raw record is stored so a person can see the evidence, not a verdict.
    expect(String(data.evidence)).toContain("rua=mailto:dmarc@bt.com");
    // Status is left to the schema default (PENDING) rather than set here.
    expect(Object.keys(data)).not.toContain("status");
  });

  it("treats losing a create race as skipped, not as an error", async () => {
    prismaMock.suppressedDomainFamilyProposal.create.mockRejectedValueOnce(
      new Error("unique constraint"),
    );
    const plans: ProposalPlan[] = [
      {
        kind: "create",
        fanIn: 1,
        link: {
          seedDomain: "bt.com",
          proposedDomain: "openreach.co.uk",
          source: "DMARC_RUA",
          evidence: "v=DMARC1",
        },
      },
    ];
    await expect(persistProposalPlans({ clientId: "c1", plans })).resolves.toEqual({
      created: 0,
      refreshed: 0,
      skipped: 1,
    });
  });
});
