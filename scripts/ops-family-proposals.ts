/**
 * Do-not-contact family discovery — run it, and see what it would ask.
 *
 *   npm run ops:family-proposals            # dry run, writes nothing
 *   npm run ops:family-proposals -- --write # writes PENDING proposals
 *
 * DRY RUN IS THE DEFAULT, deliberately. Pointing this at a live client database
 * is the normal way to use it, and the safe thing to do by accident is nothing.
 *
 * What `--write` writes is PENDING rows in `SuppressedDomainFamilyProposal`, and
 * that is all. Nothing reads that table at send time. It **cannot** create a
 * `SuppressedDomainFamily` row — only a human clicking confirm does that — and
 * this script asserts the family-row count is unchanged before it exits.
 *
 * Uses the same `planClientFamilyProposals` / `persistProposalPlans` the product
 * uses, so the report describes the code that runs rather than a copy of it.
 */
import { prisma } from "@/lib/db";
import {
  persistProposalPlans,
  planClientFamilyProposals,
} from "@/server/suppression/family-discovery-run";
import { isTenantAutoBlockEnabled } from "@/server/suppression/family-tenant";

const WRITE = process.argv.includes("--write");

type Row = {
  client: string;
  seedDomain: string;
  proposedDomain: string;
  source: string;
  evidence: string;
  fanIn: number;
  contacts: number;
  autoBlock: boolean;
};

async function main(): Promise<void> {
  console.log(WRITE ? "MODE: WRITE (PENDING proposals)" : "MODE: DRY RUN (writes nothing)");

  const familyRowsBefore = await prisma.suppressedDomainFamily.count();

  const clients = await prisma.client.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const raised: Row[] = [];
  const skipped: { client: string; pair: string; reason: string }[] = [];
  let contactDomainsChecked = 0;
  let clientsChecked = 0;
  let created = 0;

  for (const client of clients) {
    const result = await planClientFamilyProposals({ clientId: client.id });
    if (result.contactDomainsChecked === 0 || result.suppressedDomainCount === 0) continue;
    clientsChecked += 1;
    contactDomainsChecked += result.contactDomainsChecked;
    if (result.plans.length === 0) continue;

    // How many contacts each proposal would suppress, stated before anyone acts.
    const proposedDomains = result.plans.map((p) => p.link.proposedDomain);
    const counts = await prisma.contact.groupBy({
      by: ["emailDomain"],
      where: { clientId: client.id, emailDomain: { in: proposedDomains } },
      _count: { _all: true },
    });
    const byDomain = new Map(counts.map((c) => [c.emailDomain ?? "", c._count._all]));

    for (const plan of result.plans) {
      if (plan.kind === "skip") {
        skipped.push({
          client: client.name,
          pair: `${plan.link.proposedDomain} -> ${plan.link.seedDomain}`,
          reason: plan.reason,
        });
        continue;
      }
      raised.push({
        client: client.name,
        seedDomain: plan.link.seedDomain,
        proposedDomain: plan.link.proposedDomain,
        source: plan.link.source,
        evidence: plan.link.evidence,
        fanIn: plan.fanIn,
        contacts: byDomain.get(plan.link.proposedDomain) ?? 0,
        autoBlock: plan.kind === "create" && plan.autoBlock,
      });
    }

    if (WRITE) {
      const written = await persistProposalPlans({
        clientId: client.id,
        plans: result.plans,
        // This script's documented promise is that it writes questions and
        // nothing else, and the assertion at the end holds it to that. Pinned
        // to false rather than read from the environment, so turning automatic
        // blocking on in production cannot quietly change what this tool does.
        autoBlockEnabled: false,
      });
      created += written.created;
    }
  }

  console.log(`\n${"=".repeat(70)}`);
  console.log(`Clients checked                       : ${clientsChecked}`);
  console.log(`Contact domains checked               : ${contactDomainsChecked}`);
  console.log(`Proposals raised                      : ${raised.length}`);
  console.log(
    `Contacts they would suppress in total : ${raised.reduce((a, r) => a + r.contacts, 0)}`,
  );
  console.log(`Proposals refused                     : ${skipped.length}`);

  // THE NUMBER THIS SCRIPT EXISTS TO PRODUCE. The client was promised that
  // near-certain matches block automatically. This says how many would, and how
  // many prospects that would cost, BEFORE the switch is flipped — so the
  // decision is made on a measurement rather than on this code's self-esteem.
  const autoBlockable = raised.filter((r) => r.autoBlock);
  const autoBlockContacts = autoBlockable.reduce((a, r) => a + r.contacts, 0);
  console.log(`${"-".repeat(70)}`);
  console.log(`Would block AUTOMATICALLY if enabled  : ${autoBlockable.length}`);
  console.log(`Contacts that would remove            : ${autoBlockContacts}`);
  console.log(
    `Automatic blocking is currently        : ${isTenantAutoBlockEnabled() ? "ON" : "OFF"}`,
  );
  console.log(`${"=".repeat(70)}`);

  if (autoBlockable.length > 0) {
    console.log(`\nWOULD BLOCK AUTOMATICALLY (review these before enabling)`);
    for (const r of autoBlockable) {
      console.log(
        `  [${r.client}] ${r.proposedDomain}  belongs to  ${r.seedDomain}  (${r.contacts} contacts)`,
      );
      console.log(`      evidence: ${r.evidence}`);
    }
  }

  if (raised.length > 0) {
    console.log(`\nPROPOSALS`);
    for (const r of raised) {
      console.log(
        `  [${r.client}] ${r.seedDomain}  <-  ${r.proposedDomain}  (${r.source}, fanIn=${r.fanIn}, ${r.contacts} contacts)`,
      );
      console.log(`      evidence: ${r.evidence}`);
    }
  }
  if (skipped.length > 0) {
    console.log(`\nREFUSED`);
    for (const s of skipped) console.log(`  [${s.client}] ${s.pair}  (${s.reason})`);
  }

  // The invariant this whole design rests on: discovery proposes, it never blocks.
  const familyRowsAfter = await prisma.suppressedDomainFamily.count();
  console.log(
    `\nSuppressedDomainFamily rows: ${familyRowsBefore} before, ${familyRowsAfter} after`,
  );
  if (familyRowsAfter !== familyRowsBefore) {
    console.error(
      "FAILED: discovery changed the family table. It must only ever propose.",
    );
    process.exitCode = 1;
    return;
  }
  if (WRITE) console.log(`PENDING proposals written: ${created}`);
  console.log("");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e: unknown) => {
    console.error(e);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
