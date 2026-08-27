/**
 * Does any ONE mailbox address sit on TWO workspaces right now? (E-06)
 *
 *   npm run ops:mailbox-exclusivity
 *
 * READ-ONLY. It writes nothing, sends nothing and deletes nothing.
 *
 * This exists because the unit tests for E-06 prove the rule over fixtures,
 * and fixtures cannot tell anyone whether the hole is open in production
 * today. It imports the SHIPPED `findSharedMailboxAddresses` rather than
 * reimplementing the grouping, so a probe that passes is evidence about the
 * function that actually runs in the sync path — not about a copy of it.
 *
 * Addresses are masked. A duplicate is reported as which workspaces share it
 * and which one owns the raw store; the full address is never printed, because
 * this output gets pasted into logs and notes.
 *
 * Exit code is 0 whether or not duplicates are found — a duplicate is a fact
 * to report, not a build failure. Non-zero means the probe itself could not
 * run, which is the case worth failing on.
 */
import { prisma } from "@/lib/db";

import {
  findSharedMailboxAddresses,
  type LiveMailboxRow,
} from "@/server/mailbox/mailbox-address-exclusivity";

function maskAddress(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  return `${email.slice(0, Math.min(2, at))}***${email.slice(at)}`;
}

async function main(): Promise<void> {
  try {
    const rows = await prisma.clientMailboxIdentity.findMany({
      where: { workspaceRemovedAt: null, client: { deletedAt: null } },
      select: {
        id: true,
        clientId: true,
        emailNormalized: true,
        connectedAt: true,
        createdAt: true,
        client: { select: { slug: true } },
      },
    });

    const slugById = new Map(rows.map((r) => [r.clientId, r.client.slug]));
    const live: LiveMailboxRow[] = rows.map((r) => ({
      id: r.id,
      clientId: r.clientId,
      emailNormalized: r.emailNormalized,
      since: r.connectedAt ?? r.createdAt,
    }));

    const shared = findSharedMailboxAddresses(live);

    const addresses = new Set(live.map((r) => r.emailNormalized)).size;
    console.log(`Live mailbox rows: ${live.length} across ${addresses} distinct addresses.`);

    if (shared.length === 0) {
      console.log("No address is attached to more than one workspace. E-06 is not open here.");
      return;
    }

    console.log(`\n${shared.length} address(es) attached to more than one workspace:\n`);
    for (const s of shared) {
      const workspaces = s.rows
        .map((r) => `${slugById.get(r.clientId) ?? r.clientId}${r.id === s.ownerMailboxId ? " (owns the raw store)" : " (raw store suppressed)"}`)
        .join(" + ");
      console.log(`  ${maskAddress(s.emailNormalized)} -> ${workspaces}`);
    }
    console.log(
      "\nThe workspace marked suppressed keeps its replies and bounce handling; " +
        "it no longer stores a verbatim copy of that inbox.",
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error("Probe failed:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
