import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import {
  persistProposalPlans,
  planClientFamilyProposals,
} from "@/server/suppression/family-discovery-run";
import {
  confirmFamilyProposal,
  listPendingFamilyProposals,
} from "@/server/suppression/family-proposals";

/**
 * THE WHOLE CHAIN, PROVEN TO FIRE, AGAINST A REAL DATABASE.
 *
 * The tombstone test next door proves the resolver's memory. This one proves
 * something different and, for cycle 15, more important: that the path the
 * PRODUCT now takes actually produces a proposal a human can see and answer.
 *
 * The defect this exists to catch is not a wrong answer, it is silence. The
 * discovery modules were complete, migrated and covered by four passing test
 * files for two days while nothing in the product could reach them — so a
 * passing logic test is demonstrably not evidence that a feature fires.
 *
 * Every step below calls the SAME function the shipped caller calls:
 *
 *   `discoverFamilyProposalsAction` and the nightly route
 *        -> planClientFamilyProposals + persistProposalPlans
 *   the do-not-contact page
 *        -> listPendingFamilyProposals
 *   the operator's "Yes, same company" button
 *        -> confirmFamilyProposal
 *
 * NOTHING IS INSERTED BY HAND. The only fixture is a suppressed domain, a
 * contact, and a DNS record — the proposal itself is created by the resolver,
 * which is the distinction the cycle brief asked to see proved.
 *
 * DNS is injected, so the only live dependency is Postgres:
 * `npm run test:integration`.
 */

const SEED = "bt.com";
const PROPOSED = "openreach.co.uk";

/** The company's own published record. This is the machine's whole input. */
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
      entraObjectId: `wired-path-${stamp}`,
      email: `wired-path-${stamp}@example.test`,
      displayName: "Wired Path Fixture",
    },
  });
  staffUserId = staff.id;

  const client = await prisma.client.create({
    data: { name: "Wired Path Integration Test", slug: `wired-path-${stamp}` },
  });
  clientId = client.id;

  // The client has asked us not to contact BT, and has two people at a domain
  // nobody has told us is BT.
  await prisma.suppressedDomain.create({ data: { clientId, domain: SEED } });
  await prisma.contact.createMany({
    data: [
      {
        clientId,
        email: `alice@${PROPOSED}`,
        emailDomain: PROPOSED,
        fullName: "Alice Fixture",
      },
      {
        clientId,
        email: `bob@${PROPOSED}`,
        emailDomain: PROPOSED,
        fullName: "Bob Fixture",
      },
    ],
  });
});

afterAll(async () => {
  if (!clientId) return;
  await prisma.client.delete({ where: { id: clientId } }).catch(() => undefined);
  if (staffUserId) {
    await prisma.staffUser
      .delete({ where: { id: staffUserId } })
      .catch(() => undefined);
  }
  await prisma.$disconnect();
});

describe("the shipped related-domain path fires end to end", () => {
  it("the machine raises a proposal nobody typed, and the screen can read it", async () => {
    // Nothing to answer before the run. If this is not zero the rest proves
    // nothing, because the proposal could have predated the resolver.
    const before = await listPendingFamilyProposals(clientId);
    expect(before).toHaveLength(0);

    // --- What "Find related domains now" and the nightly job both run.
    const plan = await planClientFamilyProposals({ clientId, lookupTxt, lookupTenant });
    const written = await persistProposalPlans({ clientId, plans: plan.plans });
    expect(written.created).toBe(1);

    // --- What the do-not-contact page renders.
    const pending = await listPendingFamilyProposals(clientId);
    expect(pending).toHaveLength(1);
    const proposal = pending[0]!;

    expect(proposal.proposedDomain).toBe(PROPOSED);
    expect(proposal.seedDomain).toBe(SEED);
    // The machine's working, quoted back verbatim: this row was derived from a
    // DNS record, not inserted by this test.
    expect(proposal.evidence).toContain("rua=mailto:dmarc@bt.com");
    // The count is resolved BEFORE anyone clicks, which is the promise the
    // screen makes.
    expect(proposal.contactsAffected).toBe(2);

    // The operator reads sentences, not source codes.
    expect(proposal.copy.headline).toBe("Openreach may belong to BT.");
    expect(proposal.copy.ifYouConfirm).toContain("2 contacts");
    expect(proposal.copy.confirmLabel).toBe("Yes, same company");

    // --- Discovery must have proposed WITHOUT blocking anything.
    const familiesAfterDiscovery = await prisma.suppressedDomainFamily.count({
      where: { clientId },
    });
    expect(familiesAfterDiscovery).toBe(0);
    const blockedBeforeConfirm = await prisma.contact.count({
      where: { clientId, isSuppressed: true },
    });
    expect(blockedBeforeConfirm).toBe(0);

    // --- What the "Yes, same company" button runs.
    const decision = await confirmFamilyProposal({
      clientId,
      proposalId: proposal.id,
      staffUserId,
    });
    expect(decision.ok).toBe(true);

    // Now — and only now — the send gate has something to read. The seed is
    // added alongside the member so the family has something suppressed to
    // key off.
    const families = await prisma.suppressedDomainFamily.findMany({
      where: { clientId },
      orderBy: { domain: "asc" },
    });
    expect(families.map((f) => f.domain)).toEqual([SEED, PROPOSED]);
    expect(families.every((f) => f.label === "BT")).toBe(true);
    // A confirmed row is traceable back to the guess it came from.
    const member = families.find((f) => f.domain === PROPOSED);
    expect(member?.sourceProposalId).toBe(proposal.id);
    expect(member?.discoveredSource).toBe("DMARC_RUA");

    // --- The question is answered, so the screen stops asking it.
    const after = await listPendingFamilyProposals(clientId);
    expect(after).toHaveLength(0);
  });

  it("re-running after a confirmation asks nothing new", async () => {
    // The same DNS resolves the same link. It must not become a second
    // question, or the nightly job turns into a source of noise.
    const plan = await planClientFamilyProposals({ clientId, lookupTxt, lookupTenant });
    expect(plan.plans).toHaveLength(1);
    expect(plan.plans[0]?.kind).toBe("skip");
    if (plan.plans[0]?.kind === "skip") {
      expect(plan.plans[0].reason).toBe("already_confirmed");
    }

    await persistProposalPlans({ clientId, plans: plan.plans });
    expect(await listPendingFamilyProposals(clientId)).toHaveLength(0);
  });
});
