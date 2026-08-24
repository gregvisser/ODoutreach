import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = vi.hoisted(() => ({
  suppressedDomainFamilyProposal: { updateMany: vi.fn() },
  suppressedDomainFamily: { upsert: vi.fn() },
}));

const prismaMock = vi.hoisted(() => ({
  suppressedDomainFamilyProposal: { findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
  suppressedDomainFamily: { upsert: vi.fn() },
  contact: { groupBy: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ prisma: prismaMock }));

import {
  confirmFamilyProposal,
  listPendingFamilyProposals,
  rejectFamilyProposal,
} from "./family-proposals";

/**
 * Deciding a proposal.
 *
 * Two properties matter more than the rest:
 *
 *   1. **Tenant isolation.** Every read and write is scoped by `clientId` as
 *      well as by row id, so one workspace can never answer another's question.
 *      This is asserted on the WHERE clauses rather than trusted.
 *   2. **A rejection is not a deletion.** The row moves to `REJECTED` and stays
 *      there, because deletion is exactly the defect this store was built to fix.
 */

const PROPOSAL = {
  id: "p1",
  clientId: "c1",
  seedDomain: "bt.com",
  proposedDomain: "openreach.co.uk",
  source: "DMARC_RUA" as const,
  evidence: "v=DMARC1; p=reject; rua=mailto:dmarc@bt.com",
  fanIn: 1,
  discoveredAt: new Date("2026-08-24T10:00:00Z"),
  status: "PENDING" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx));
  tx.suppressedDomainFamilyProposal.updateMany.mockResolvedValue({ count: 1 });
  tx.suppressedDomainFamily.upsert.mockResolvedValue({ id: "f1" });
  prismaMock.suppressedDomainFamilyProposal.findFirst.mockResolvedValue(PROPOSAL);
  prismaMock.suppressedDomainFamilyProposal.updateMany.mockResolvedValue({ count: 1 });
});

describe("listPendingFamilyProposals", () => {
  it("states how many contacts each would suppress, before it is answered", async () => {
    prismaMock.suppressedDomainFamilyProposal.findMany.mockResolvedValue([PROPOSAL]);
    prismaMock.contact.groupBy.mockResolvedValue([
      { emailDomain: "openreach.co.uk", _count: { _all: 4 } },
    ]);

    const [view] = await listPendingFamilyProposals("c1");

    expect(view?.contactsAffected).toBe(4);
    expect(view?.copy.ifYouConfirm).toContain("4 contacts");
    expect(view?.copy.headline).toBe("Openreach may belong to BT.");
  });

  it("only ever reads this client's pending rows", async () => {
    prismaMock.suppressedDomainFamilyProposal.findMany.mockResolvedValue([]);
    await listPendingFamilyProposals("c1");
    const where = prismaMock.suppressedDomainFamilyProposal.findMany.mock.calls[0]?.[0]
      .where as Record<string, unknown>;
    expect(where).toEqual({ clientId: "c1", status: "PENDING" });
  });

  it("says nobody is affected rather than showing a bare zero", async () => {
    prismaMock.suppressedDomainFamilyProposal.findMany.mockResolvedValue([PROPOSAL]);
    prismaMock.contact.groupBy.mockResolvedValue([]);
    const [view] = await listPendingFamilyProposals("c1");
    expect(view?.copy.ifYouConfirm).toContain("Nobody on your current lists is affected");
  });
});

describe("confirmFamilyProposal", () => {
  it("writes a family row and marks the proposal confirmed", async () => {
    const result = await confirmFamilyProposal({
      clientId: "c1",
      proposalId: "p1",
      staffUserId: "s1",
    });
    expect(result.ok).toBe(true);

    // The confirmed member records WHICH proposal it came from, so it can be
    // told apart from a hand-typed row.
    const memberUpsert = tx.suppressedDomainFamily.upsert.mock.calls[0]?.[0] as {
      create: Record<string, unknown>;
    };
    expect(memberUpsert.create).toMatchObject({
      clientId: "c1",
      domain: "openreach.co.uk",
      label: "BT",
      sourceProposalId: "p1",
      discoveredSource: "DMARC_RUA",
    });
  });

  it("also anchors the family with the suppressed seed", async () => {
    await confirmFamilyProposal({ clientId: "c1", proposalId: "p1", staffUserId: "s1" });
    const seedUpsert = tx.suppressedDomainFamily.upsert.mock.calls[1]?.[0] as {
      create: Record<string, unknown>;
    };
    // Without the seed the family has no suppressed member and blocks nothing.
    expect(seedUpsert.create).toMatchObject({ domain: "bt.com", label: "BT" });
    // The seed is a human-listed fact, not a discovery — no provenance on it.
    expect(Object.keys(seedUpsert.create)).not.toContain("sourceProposalId");
  });

  it("is scoped by clientId, so one workspace cannot answer another's question", async () => {
    await confirmFamilyProposal({ clientId: "c1", proposalId: "p1", staffUserId: "s1" });
    const read = prismaMock.suppressedDomainFamilyProposal.findFirst.mock.calls[0]?.[0]
      .where as Record<string, unknown>;
    expect(read).toMatchObject({ id: "p1", clientId: "c1", status: "PENDING" });

    const write = tx.suppressedDomainFamilyProposal.updateMany.mock.calls[0]?.[0]
      .where as Record<string, unknown>;
    expect(write).toMatchObject({ id: "p1", clientId: "c1", status: "PENDING" });
  });

  it("refuses a proposal that has already been answered", async () => {
    prismaMock.suppressedDomainFamilyProposal.findFirst.mockResolvedValue(null);
    const result = await confirmFamilyProposal({
      clientId: "c1",
      proposalId: "p1",
      staffUserId: "s1",
    });
    expect(result.ok).toBe(false);
    expect(tx.suppressedDomainFamily.upsert).not.toHaveBeenCalled();
  });
});

describe("rejectFamilyProposal — final, and not a deletion", () => {
  it("moves the row to REJECTED rather than deleting it", async () => {
    prismaMock.suppressedDomainFamilyProposal.findFirst.mockResolvedValue({
      proposedDomain: "openreach.co.uk",
    });
    const result = await rejectFamilyProposal({
      clientId: "c1",
      proposalId: "p1",
      staffUserId: "s1",
    });
    expect(result.ok).toBe(true);

    const call = prismaMock.suppressedDomainFamilyProposal.updateMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    };
    expect(call.data.status).toBe("REJECTED");
    expect(call.where).toMatchObject({ id: "p1", clientId: "c1", status: "PENDING" });
  });

  it("never writes a family row", async () => {
    prismaMock.suppressedDomainFamilyProposal.findFirst.mockResolvedValue({
      proposedDomain: "openreach.co.uk",
    });
    await rejectFamilyProposal({ clientId: "c1", proposalId: "p1", staffUserId: "s1" });
    expect(prismaMock.suppressedDomainFamily.upsert).not.toHaveBeenCalled();
    expect(tx.suppressedDomainFamily.upsert).not.toHaveBeenCalled();
  });

  it("refuses to answer a question that is already answered", async () => {
    prismaMock.suppressedDomainFamilyProposal.updateMany.mockResolvedValue({ count: 0 });
    const result = await rejectFamilyProposal({
      clientId: "c1",
      proposalId: "p1",
      staffUserId: "s1",
    });
    expect(result.ok).toBe(false);
  });
});
