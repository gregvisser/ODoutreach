/**
 * TEMPORARY, one-off diagnostic for row 133 defect (3) — deleted before merge.
 * READ-ONLY. Answers: for the clients that own the 11 known-BOUNCED rows,
 * what does the Reports/Activity page actually compute and show today, and
 * are those bounces excluded by the internal-seed allowlist?
 */
import { prisma } from "@/lib/db";
import { isInternalSeedAllowlistEnabled, listActiveInternalSeedEmails } from "@/server/internal-seed/seed-allowlist";
import { loadClientOutreachMetrics } from "@/server/queries/outreach-metrics";
import { formatRate } from "@/lib/reports/outreach-metrics";

async function main(): Promise<void> {
  try {
    const seedEnabled = isInternalSeedAllowlistEnabled();
    const seedEmails = await listActiveInternalSeedEmails();
    console.log(`INTERNAL_SEED_ALLOWLIST_ENABLED=${seedEnabled}, active seed emails: ${seedEmails.length}`);

    const bounced = await prisma.outboundEmail.findMany({
      where: { OR: [{ status: "BOUNCED" }, { bouncedAt: { not: null } }] },
      select: { id: true, toEmail: true, clientId: true },
    });

    const byClient = new Map<string, { count: number; seedExcluded: number; sample: string[] }>();
    for (const row of bounced) {
      const isSeed = seedEmails.includes(row.toEmail.trim().toLowerCase());
      const entry = byClient.get(row.clientId) ?? { count: 0, seedExcluded: 0, sample: [] };
      entry.count += 1;
      if (isSeed) entry.seedExcluded += 1;
      entry.sample.push(`${row.toEmail.slice(0, 2)}***(seed=${isSeed})`);
      byClient.set(row.clientId, entry);
    }

    const clients = await prisma.client.findMany({
      where: { id: { in: [...byClient.keys()] } },
      select: { id: true, name: true },
    });
    const accessible = clients.map((c) => c.id);

    for (const c of clients) {
      const info = byClient.get(c.id);
      console.log(`\nClient ${c.name} (${c.id}): ${info?.count} bounced row(s), ${info?.seedExcluded} on active seed allowlist.`);
      console.log(`  toEmail samples: ${info?.sample.join(", ")}`);
      const metrics = await loadClientOutreachMetrics(c.id, accessible);
      console.log(`  Reports/Activity would show: sent=${metrics.sent}, bounces=${metrics.bounces}, bounceRate=${formatRate(metrics.bounceRate)}`);
    }

    // Also check every client with zero bounce rows at all, to see whether
    // their display is "0%" (sent>0, 0 bounces) or "—" (sent=0).
    const allClients = await prisma.client.findMany({ select: { id: true, name: true } });
    const allIds = allClients.map((c) => c.id);
    console.log("\n--- Every client's current bounce display ---");
    for (const c of allClients) {
      const metrics = await loadClientOutreachMetrics(c.id, allIds);
      console.log(`${c.name}: sent=${metrics.sent} bounces=${metrics.bounces} bounceRate=${formatRate(metrics.bounceRate)}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error("Probe failed:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
