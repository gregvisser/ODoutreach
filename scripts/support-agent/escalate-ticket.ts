/**
 * Hand a ticket back to Greg without looping on it.
 *
 * Sets status=AWAITING_APPROVAL (removes it from the OPEN queue) and stores the
 * analysis in proposedFix. Optionally sets a short reporter-facing resolutionNote
 * and emails the reporter best-effort.
 *
 *   npm run support:escalate -- <ticketId> --reason "for Greg" [--note "for reporter"]
 */
import { getPrisma } from "./_db";
import { notifyReporter } from "./notify-reporter";

function flag(name: string): string {
  const i = process.argv.indexOf(name);
  return i > -1 ? (process.argv[i + 1] ?? "") : "";
}

async function main() {
  const id = process.argv[2];
  const reason = flag("--reason").trim();
  const note = flag("--note").trim();
  if (!id || !reason) {
    throw new Error(
      `usage: escalate-ticket <ticketId> --reason "for Greg" [--note "for reporter"]`,
    );
  }
  const prisma = await getPrisma();
  const existing = await prisma.supportTicket.findUnique({
    where: { id },
    select: { reporterEmail: true, title: true },
  });
  if (!existing) throw new Error(`ticket ${id} not found`);

  await prisma.supportTicket.update({
    where: { id },
    data: {
      status: "AWAITING_APPROVAL",
      proposedFix: reason,
      ...(note ? { resolutionNote: note } : {}),
    },
  });
  console.log(`escalated ${id}`);

  if (note) {
    try {
      await notifyReporter(
        existing.reporterEmail,
        `Your ODoutreach ticket: ${existing.title}`,
        note,
      );
    } catch {
      // best-effort — email must never block the escalation
    }
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
