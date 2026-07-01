/**
 * Close a support ticket with a reporter-facing reply.
 *
 * Sets status=RESOLVED, resolvedAt=now, resolutionNote=<your reply>. Guards
 * against re-resolving an already-RESOLVED ticket. After the DB update it emails
 * the reporter best-effort (never blocks the close — see notify-reporter.ts).
 *
 *   npm run support:resolve -- <ticketId> --note "reply the reporter reads"
 */
import { getPrisma } from "./_db";
import { notifyReporter } from "./notify-reporter";

function flag(name: string): string {
  const i = process.argv.indexOf(name);
  return i > -1 ? (process.argv[i + 1] ?? "") : "";
}

async function main() {
  const id = process.argv[2];
  const note = flag("--note").trim();
  if (!id || !note) {
    throw new Error(
      `usage: resolve-ticket <ticketId> --note "reply to reporter"`,
    );
  }
  const prisma = await getPrisma();
  const existing = await prisma.supportTicket.findUnique({
    where: { id },
    select: { status: true, reporterEmail: true, title: true },
  });
  if (!existing) throw new Error(`ticket ${id} not found`);
  if (existing.status === "RESOLVED") throw new Error("already resolved");

  await prisma.supportTicket.update({
    where: { id },
    data: { status: "RESOLVED", resolvedAt: new Date(), resolutionNote: note },
  });
  console.log(`resolved ${id}`);

  try {
    await notifyReporter(
      existing.reporterEmail,
      `Your ODoutreach ticket: ${existing.title}`,
      note,
    );
  } catch {
    // best-effort — email must never block the close
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
