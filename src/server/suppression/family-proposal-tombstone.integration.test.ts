import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import {
  persistProposalPlans,
  planClientFamilyProposals,
} from "@/server/suppression/family-discovery-run";
import { rejectFamilyProposal } from "@/server/suppression/family-proposals";

/**
 * THE TOMBSTONE, PROVEN END TO END AGAINST A REAL TABLE.
 *
 * Every other test of this property runs against mocks. This one runs the real
 * resolver against a real Postgres, twice, across a real rejection — because the
 * defect being prevented is a DATABASE behaviour: a row deleted, then silently
 * re-created by the next resolution run reading the same unchanged DNS.
 *
 * The 30-day re-resolution is the mechanism that made deletion unsafe. Nothing
 * should ever schedule it until this passes.
 *
 * Needs a database: `npm run test:integration`. DNS is injected, so the only
 * live dependency is Postgres.
 */

const CLIENT_SLUG = "tombstone-integration-test";
const SEED = "bt.com";
const PROPOSED = "openreach.co.uk";

/** Unchanged between runs — the whole point is that the evidence does not move. */
const DNS: Record<string, string[]> = {
  [`_dmarc.${PROPOSED}`]: ["v=DMARC1; p=reject; rua=mailto:dmarc@bt.com"],
  [PROPOSED]: [],
};
const lookupTxt = async (name: string): Promise<string[]> => DNS[name] ?? [];

/**
 * The tenant leg, stubbed to silence. These specs pin the DNS sources, and a
 * real lookup here would put an unauthenticated HTTPS call to Microsoft inside
 * a suite that must stay offline. `null` is what a domain outside Microsoft 365
 * genuinely returns, so this is the quiet case, not a fake one.
 */
const lookupTenant = async (): Promise<string | null> => null;

let clientId = "";
let staffUserId = "";

beforeAll(async () => {
  const stamp = Date.now();
  const staff = await prisma.staffUser.create({
    data: {
      entraObjectId: `tombstone-${stamp}`,
      email: `tombstone-${stamp}@example.test`,
      displayName: "Tombstone Fixture",
    },
  });
  staffUserId = staff.id;

  const client = await prisma.client.create({
    data: { name: "Tombstone Integration Test", slug: `${CLIENT_SLUG}-${stamp}` },
  });
  clientId = client.id;

  await prisma.suppressedDomain.create({ data: { clientId, domain: SEED } });
  await prisma.contact.create({
    data: {
      clientId,
      email: `someone@${PROPOSED}`,
      emailDomain: PROPOSED,
      fullName: "Integration Fixture",
    },
  });
});

afterAll(async () => {
  if (!clientId) return;
  // Cascades clear the proposal, suppression and contact rows.
  await prisma.client.delete({ where: { id: clientId } }).catch(() => undefined);
  if (staffUserId) {
    await prisma.staffUser.delete({ where: { id: staffUserId } }).catch(() => undefined);
  }
  await prisma.$disconnect();
});

describe("a rejected proposal survives re-resolution", () => {
  it("raises the proposal, is rejected, and is never raised again", async () => {
    // --- Run 1: the link is found and a question is raised.
    const first = await planClientFamilyProposals({ clientId, lookupTxt, lookupTenant });
    expect(first.plans).toHaveLength(1);
    expect(first.plans[0]?.kind).toBe("create");
    await persistProposalPlans({ clientId, plans: first.plans });

    const raised = await prisma.suppressedDomainFamilyProposal.findFirst({
      where: { clientId, seedDomain: SEED, proposedDomain: PROPOSED },
    });
    expect(raised?.status).toBe("PENDING");
    expect(raised?.evidence).toContain("rua=mailto:dmarc@bt.com");

    // --- A person says no.
    const rejection = await rejectFamilyProposal({
      clientId,
      proposalId: raised!.id,
      staffUserId,
    });
    expect(rejection.ok).toBe(true);

    const afterReject = await prisma.suppressedDomainFamilyProposal.findUnique({
      where: { id: raised!.id },
    });
    // Rejected, not deleted. Deletion is the defect.
    expect(afterReject).not.toBeNull();
    expect(afterReject?.status).toBe("REJECTED");

    // --- Run 2: thirty days later. Same DNS, same link, same answer.
    const second = await planClientFamilyProposals({ clientId, lookupTxt, lookupTenant });
    expect(second.plans).toHaveLength(1);
    expect(second.plans[0]?.kind).toBe("skip");
    if (second.plans[0]?.kind === "skip") {
      expect(second.plans[0].reason).toBe("rejected_tombstone");
    }
    await persistProposalPlans({ clientId, plans: second.plans });

    // --- The row is still rejected, and no PENDING duplicate appeared.
    const all = await prisma.suppressedDomainFamilyProposal.findMany({
      where: { clientId, seedDomain: SEED, proposedDomain: PROPOSED },
    });
    expect(all).toHaveLength(1);
    expect(all[0]?.status).toBe("REJECTED");
    expect(all[0]?.id).toBe(raised!.id);

    const pending = await prisma.suppressedDomainFamilyProposal.count({
      where: { clientId, status: "PENDING" },
    });
    expect(pending).toBe(0);
  });

  it("created no family row at any point — discovery proposes, it never blocks", async () => {
    const families = await prisma.suppressedDomainFamily.count({ where: { clientId } });
    expect(families).toBe(0);
  });
});
