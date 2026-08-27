import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { evaluateSuppression } from "@/server/outreach/suppression-guard";
import {
  persistProposalPlans,
  planClientFamilyProposals,
} from "@/server/suppression/family-discovery-run";
import { listPendingFamilyProposals } from "@/server/suppression/family-proposals";
import { listDomainFamiliesForClient } from "@/server/suppression/domain-families";

/**
 * THE AUTOMATIC BLOCK, PROVEN TO STOP A SEND — not proven to write a row.
 *
 * QUEUE.md records six occasions this week where something was built, wired,
 * reported success and never actually fired. The way that keeps happening is a
 * test that asserts the thing it just wrote exists. So the assertion that
 * matters here is the LAST one in each case: `evaluateSuppression`, the real
 * send gate, called with a real address, returning suppressed.
 *
 * Both directions are pinned, because a switch that cannot be off is not a
 * switch:
 *
 *   * flag OFF — a near-certain tenant match raises a QUESTION and the gate
 *     still lets the address through. This is production's behaviour today.
 *   * flag ON  — the same match blocks with nobody asked, and the gate refuses.
 *
 * Needs a database: `npm run test:integration`. Every lookup is injected, so
 * nothing here touches DNS or Microsoft.
 */

/** Read live from Microsoft on 2026-08-27. Lloyds Banking Group. */
const TENANT = "3ded2960-214a-46ff-8cf4-611f125e2398";
const SEED = "bankofscotland.co.uk";
const PROPOSED = "halifax.co.uk";

/**
 * Both domains are in one tenant; nothing else is.
 *
 * Note what the DNS stub says: NOTHING. That is not a convenience — it is the
 * measured truth. `halifax.co.uk` and `bankofscotland.co.uk` both send their
 * DMARC reports to `rua.agari.com`, a shared vendor, and neither publishes an
 * SPF `redirect=`. The two sources that shipped in August find this pair only
 * if a vendor is on the client's list, and then only as a vendor link the
 * fan-in cap throws away. This test therefore also pins the gap the client was
 * right to complain about.
 */
const TENANTS: Record<string, string> = {
  [SEED]: TENANT,
  [PROPOSED]: TENANT,
};
const lookupTenant = async (domain: string): Promise<string | null> =>
  TENANTS[domain.toLowerCase()] ?? null;
const lookupTxt = async (): Promise<string[]> => [];

let clientId = "";

beforeAll(async () => {
  const stamp = Date.now();
  const client = await prisma.client.create({
    data: { name: "Tenant Auto-Block Test", slug: `tenant-auto-block-${stamp}` },
  });
  clientId = client.id;

  // The client has asked us not to contact Bank of Scotland, and has three
  // people at Halifax — a name nobody has told us is the same company.
  await prisma.suppressedDomain.create({ data: { clientId, domain: SEED } });
  await prisma.contact.createMany({
    data: ["alice", "bob", "carol"].map((name) => ({
      clientId,
      email: `${name}@${PROPOSED}`,
      emailDomain: PROPOSED,
      fullName: `${name} Fixture`,
    })),
  });
});

afterEach(async () => {
  // Each case starts from "nobody has decided anything", so neither can pass on
  // the other's leftovers.
  if (!clientId) return;
  await prisma.suppressedDomainFamily.deleteMany({ where: { clientId } });
  await prisma.suppressedDomainFamilyProposal.deleteMany({ where: { clientId } });
});

afterAll(async () => {
  if (clientId) {
    await prisma.client.delete({ where: { id: clientId } }).catch(() => undefined);
  }
  await prisma.$disconnect();
});

describe("a near-certain tenant match, with automatic blocking OFF", () => {
  it("asks instead of acting, and the send gate still allows the address", async () => {
    const before = await evaluateSuppression(clientId, `alice@${PROPOSED}`);
    expect(before.suppressed).toBe(false);

    const plan = await planClientFamilyProposals({
      clientId,
      lookupTxt,
      lookupTenant,
    });

    // The link was found, and found ELIGIBLE to block — the flag is the only
    // thing standing between this and a block.
    expect(plan.plans).toEqual([
      expect.objectContaining({ kind: "create", autoBlock: true }),
    ]);
    expect(plan.links[0]?.source).toBe("MICROSOFT_TENANT");
    expect(plan.links[0]?.evidence).toContain(TENANT);

    const written = await persistProposalPlans({
      clientId,
      plans: plan.plans,
      autoBlockEnabled: false,
    });
    expect(written).toMatchObject({ created: 1, autoBlocked: 0 });

    // A question on the screen…
    const pending = await listPendingFamilyProposals(clientId);
    expect(pending).toHaveLength(1);
    // "Bankofscotland" rather than "Bank of Scotland": the display helper
    // cannot split a run-together domain, and guessing where the words go is
    // how you get "Bt Europe". Left alone deliberately — the sentence below is
    // what an operator actually decides on.
    expect(pending[0]?.copy.headline).toBe("Halifax may belong to Bankofscotland.");
    expect(pending[0]?.copy.because).toContain("share one Microsoft 365 account");
    expect(pending[0]?.contactsAffected).toBe(3);

    // …and nothing the send gate can read.
    expect(await prisma.suppressedDomainFamily.count({ where: { clientId } })).toBe(0);
    const after = await evaluateSuppression(clientId, `alice@${PROPOSED}`);
    expect(after.suppressed).toBe(false);
  });
});

describe("a near-certain tenant match, with automatic blocking ON", () => {
  it("blocks with nobody asked, and the send gate REFUSES the address", async () => {
    // Before: the address is sendable. If this were already suppressed the rest
    // of the test would prove nothing.
    const before = await evaluateSuppression(clientId, `alice@${PROPOSED}`);
    expect(before.suppressed).toBe(false);

    const plan = await planClientFamilyProposals({
      clientId,
      lookupTxt,
      lookupTenant,
    });
    const written = await persistProposalPlans({
      clientId,
      plans: plan.plans,
      autoBlockEnabled: true,
    });
    expect(written).toMatchObject({ created: 1, autoBlocked: 1 });

    // THE ASSERTION THIS TEST EXISTS FOR. Not "a row was written" — a real
    // address, through the real gate, refused.
    const after = await evaluateSuppression(clientId, `alice@${PROPOSED}`);
    expect(after.suppressed).toBe(true);

    // Every contact at the domain, not just the one we asked about.
    for (const name of ["bob", "carol"]) {
      const decision = await evaluateSuppression(clientId, `${name}@${PROPOSED}`);
      expect(decision.suppressed).toBe(true);
    }

    // The block is attributable and undoable: no staff member's name is on it,
    // the evidence is stored, and the proposal it came from is still there.
    const family = await prisma.suppressedDomainFamily.findFirst({
      where: { clientId, domain: PROPOSED },
    });
    expect(family).toMatchObject({
      discoveredSource: "MICROSOFT_TENANT",
      createdByStaffUserId: null,
    });
    expect(family?.sourceProposalId).toBeTruthy();

    const proposal = await prisma.suppressedDomainFamilyProposal.findFirst({
      where: { clientId, proposedDomain: PROPOSED },
    });
    // CONFIRMED, but by nobody — that is how the screen tells an automatic
    // block from a person's decision.
    expect(proposal).toMatchObject({
      status: "CONFIRMED",
      decidedByStaffUserId: null,
    });
    expect(proposal?.evidence).toContain(TENANT);

    // The seed anchors the family, or the gate has nothing to key off.
    expect(
      await prisma.suppressedDomainFamily.count({ where: { clientId } }),
    ).toBe(2);

    // AND THE OPERATOR CAN SEE IT. A block nobody can see is a block nobody
    // can undo, so the screen that lists families must mark this one as the
    // machine's doing — and must NOT mark the seed, which was already on the
    // client's own list.
    const families = await listDomainFamiliesForClient(clientId);
    const members = families.flatMap((f) => f.members);
    expect(members.find((m) => m.domain === PROPOSED)?.addedAutomatically).toBe(true);
    expect(members.find((m) => m.domain === SEED)?.addedAutomatically).toBe(false);
    // And the family is actually blocking, not merely listed.
    expect(families.every((f) => f.isBlocking)).toBe(true);
  });

  it("still refuses to block a pair a person has already rejected", async () => {
    // The tombstone outranks the automatic block. Without this, turning the
    // flag on would silently reinstate every link an operator had refused.
    await prisma.suppressedDomainFamilyProposal.create({
      data: {
        clientId,
        seedDomain: SEED,
        proposedDomain: PROPOSED,
        source: "MICROSOFT_TENANT",
        evidence: `Microsoft 365 tenant ${TENANT}`,
        fanIn: 1,
        status: "REJECTED",
      },
    });

    const plan = await planClientFamilyProposals({
      clientId,
      lookupTxt,
      lookupTenant,
    });
    expect(plan.plans).toEqual([
      expect.objectContaining({ kind: "skip", reason: "rejected_tombstone" }),
    ]);

    const written = await persistProposalPlans({
      clientId,
      plans: plan.plans,
      autoBlockEnabled: true,
    });
    expect(written).toMatchObject({ autoBlocked: 0, created: 0 });

    expect(await prisma.suppressedDomainFamily.count({ where: { clientId } })).toBe(0);
    const decision = await evaluateSuppression(clientId, `alice@${PROPOSED}`);
    expect(decision.suppressed).toBe(false);
  });
});
