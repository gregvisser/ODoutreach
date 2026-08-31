/**
 * TEMPORARY, one-off diagnostic for row 133 defect (3) — deleted before merge.
 * READ-ONLY. No 'server-only' imports (runs under bare tsx, not Next's
 * bundler) — replicates the production predicates inline instead of
 * importing the modules that carry that guard.
 */
import { prisma } from "@/lib/db";

const SEED_FLAG = (process.env.INTERNAL_SEED_ALLOWLIST_ENABLED ?? "")
  .trim()
  .toLowerCase();
const PROVEN_SEND_STATUSES = ["SENT", "DELIVERED", "REPLIED", "BOUNCED"];

function safeRate(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}
function formatRate(rate: number | null): string {
  return rate === null ? "—" : `${rate}%`;
}

async function main(): Promise<void> {
  try {
    console.log(`INTERNAL_SEED_ALLOWLIST_ENABLED=${SEED_FLAG === "true"}`);
    const seedRows = SEED_FLAG === "true"
      ? await prisma.internalSeedAddress.findMany({
          where: { isActive: true },
          select: { email: true },
        })
      : [];
    const seedEmails = seedRows.map((r) => r.email);
    console.log(`Active seed emails: ${seedEmails.length}`);

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

    const allClients = await prisma.client.findMany({ select: { id: true, name: true } });

    for (const c of allClients) {
      const info = byClient.get(c.id);
      const seedExclusion = seedEmails.length > 0 ? { toEmail: { notIn: seedEmails } } : {};
      const sent = await prisma.outboundEmail.count({
        where: {
          clientId: c.id,
          ...seedExclusion,
          status: { in: PROVEN_SEND_STATUSES },
          OR: [{ sentAt: { not: null } }, { providerMessageId: { not: null } }],
        },
      });
      const bounces = await prisma.outboundEmail.count({
        where: { clientId: c.id, ...seedExclusion, status: "BOUNCED" },
      });
      const rate = safeRate(bounces, sent);
      const line = `${c.name}: sent=${sent} bounces=${bounces} bounceRate=${formatRate(rate)}`;
      if (info) {
        console.log(
          `\n${line}\n  RAW bounced rows for this client (before seed exclusion): ${info.count}, of which ${info.seedExcluded} are on the active seed allowlist.\n  toEmail samples: ${info.sample.join(", ")}`,
        );
      } else {
        console.log(line);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error("Probe failed:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
