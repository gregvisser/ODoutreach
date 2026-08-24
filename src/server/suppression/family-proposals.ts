import "server-only";

import { prisma } from "@/lib/db";
import { buildFamilyProposalCopy } from "@/lib/suppression/family-proposal-copy";
import { companyNameFromDomain } from "@/lib/suppression/family-proposal-copy";

/**
 * Reading and deciding machine-proposed family links.
 *
 * A proposal is a QUESTION. Nothing here is read by the send gate, and a
 * proposal on its own blocks nothing — only `confirmFamilyProposal` writes a
 * `SuppressedDomainFamily` row, and that is what the gate reads. RULING 3
 * (Greg, 2026-08-24) is intact: membership remains a human-confirmed fact.
 */

export type PendingProposalView = {
  id: string;
  proposedDomain: string;
  seedDomain: string;
  fanIn: number;
  contactsAffected: number;
  /** The raw record, shown behind a disclosure for anyone who wants it. */
  evidence: string;
  copy: ReturnType<typeof buildFamilyProposalCopy>;
};

/**
 * The pending questions for a client, with the number of contacts each would
 * suppress resolved so the screen can state it BEFORE the button is pressed.
 */
export async function listPendingFamilyProposals(
  clientId: string,
): Promise<PendingProposalView[]> {
  const rows = await prisma.suppressedDomainFamilyProposal.findMany({
    where: { clientId, status: "PENDING" },
    orderBy: [{ fanIn: "asc" }, { discoveredAt: "desc" }],
  });
  if (rows.length === 0) return [];

  const counts = await prisma.contact.groupBy({
    by: ["emailDomain"],
    where: {
      clientId,
      emailDomain: { in: rows.map((r) => r.proposedDomain) },
    },
    _count: { _all: true },
  });
  const byDomain = new Map(
    counts.map((c) => [c.emailDomain ?? "", c._count._all] as const),
  );

  return rows.map((row) => {
    const contactsAffected = byDomain.get(row.proposedDomain) ?? 0;
    return {
      id: row.id,
      proposedDomain: row.proposedDomain,
      seedDomain: row.seedDomain,
      fanIn: row.fanIn,
      contactsAffected,
      evidence: row.evidence,
      copy: buildFamilyProposalCopy({
        proposedDomain: row.proposedDomain,
        seedDomain: row.seedDomain,
        source: row.source,
        fanIn: row.fanIn,
        contactsAffected,
      }),
    };
  });
}

export type DecisionResult =
  | { ok: true; proposedDomain: string; contactsAffected?: number }
  | { ok: false; error: string };

/**
 * Confirm: the operator says these are the same company.
 *
 * This is the ONLY path from a machine guess to something the send gate reads.
 * The family row records which proposal it came from, so a confirmed row can
 * always be told apart from a hand-typed one.
 *
 * The label is the seed's company name, so a confirmed member joins the family
 * that the suppressed domain already anchors.
 */
export async function confirmFamilyProposal(input: {
  clientId: string;
  proposalId: string;
  staffUserId: string;
}): Promise<DecisionResult> {
  const proposal = await prisma.suppressedDomainFamilyProposal.findFirst({
    // Scoped by clientId as well as id — never decide another workspace's row.
    where: { id: input.proposalId, clientId: input.clientId, status: "PENDING" },
  });
  if (!proposal) {
    return { ok: false, error: "That suggestion has already been answered." };
  }

  const label = companyNameFromDomain(proposal.seedDomain);

  await prisma.$transaction(async (tx) => {
    await tx.suppressedDomainFamilyProposal.updateMany({
      where: { id: proposal.id, clientId: input.clientId, status: "PENDING" },
      data: {
        status: "CONFIRMED",
        decidedByStaffUserId: input.staffUserId,
        decidedAt: new Date(),
      },
    });
    await tx.suppressedDomainFamily.upsert({
      where: {
        clientId_domain: { clientId: input.clientId, domain: proposal.proposedDomain },
      },
      update: {
        sourceProposalId: proposal.id,
        discoveredSource: proposal.source,
        discoveredAt: proposal.discoveredAt,
      },
      create: {
        clientId: input.clientId,
        label,
        domain: proposal.proposedDomain,
        createdByStaffUserId: input.staffUserId,
        sourceProposalId: proposal.id,
        discoveredSource: proposal.source,
        discoveredAt: proposal.discoveredAt,
      },
    });
    // The seed anchors the family. Without it, confirming one member creates a
    // family whose only member is the newcomer, and the gate has nothing
    // suppressed to key off.
    await tx.suppressedDomainFamily.upsert({
      where: {
        clientId_domain: { clientId: input.clientId, domain: proposal.seedDomain },
      },
      update: {},
      create: {
        clientId: input.clientId,
        label,
        domain: proposal.seedDomain,
        createdByStaffUserId: input.staffUserId,
      },
    });
  });

  return { ok: true, proposedDomain: proposal.proposedDomain };
}

/**
 * Reject: the operator says these are different companies. **Final.**
 *
 * The row is not deleted. `REJECTED` is a tombstone, and it is the entire reason
 * this store exists: deleting it would let the next resolution read the same DNS
 * and silently ask — or worse, act — again.
 */
export async function rejectFamilyProposal(input: {
  clientId: string;
  proposalId: string;
  staffUserId: string;
}): Promise<DecisionResult> {
  const updated = await prisma.suppressedDomainFamilyProposal.updateMany({
    where: { id: input.proposalId, clientId: input.clientId, status: "PENDING" },
    data: {
      status: "REJECTED",
      decidedByStaffUserId: input.staffUserId,
      decidedAt: new Date(),
    },
  });
  if (updated.count === 0) {
    return { ok: false, error: "That suggestion has already been answered." };
  }
  const row = await prisma.suppressedDomainFamilyProposal.findFirst({
    where: { id: input.proposalId, clientId: input.clientId },
    select: { proposedDomain: true },
  });
  return { ok: true, proposedDomain: row?.proposedDomain ?? "" };
}
