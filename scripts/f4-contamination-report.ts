/**
 * F4 contamination review (READ-ONLY).
 *
 * Lists historical `InboundReply` rows whose SENDER is on one of the
 * workspace's own mailbox domains — i.e. internal staff mail that was
 * mislinked to a prospect before the F4 fix. A genuine prospect reply never
 * comes from the client's own domain, so these are the contamination
 * candidates. Each one marked the linked OutboundEmail as REPLIED and, via
 * stop-on-reply, COMPLETED (stopped) the prospect's enrolment.
 *
 * This script ONLY reads. It does NOT change anything. Per the Prime
 * Directive, the historical records are left for a human to review and
 * decide — auto-un-stopping an enrolment could resume sends.
 *
 *   Run:  DATABASE_URL=... npx tsx scripts/f4-contamination-report.ts
 */
import { prisma } from "@/lib/db";
import { deriveInternalDomains, emailDomain } from "@/lib/inbox/internal-mail";

async function main(): Promise<void> {
  // clientId -> the workspace's own mailbox domains.
  const mailboxes = await prisma.clientMailboxIdentity.findMany({
    select: { clientId: true, email: true },
  });
  const emailsByClient = new Map<string, string[]>();
  for (const m of mailboxes) {
    const list = emailsByClient.get(m.clientId) ?? [];
    list.push(m.email);
    emailsByClient.set(m.clientId, list);
  }
  const internalByClient = new Map<string, Set<string>>();
  for (const [clientId, emails] of emailsByClient) {
    internalByClient.set(clientId, new Set(deriveInternalDomains(emails)));
  }

  const replies = await prisma.inboundReply.findMany({
    select: {
      id: true,
      clientId: true,
      fromEmail: true,
      toEmail: true,
      subject: true,
      matchMethod: true,
      linkedOutboundEmailId: true,
      receivedAt: true,
      createdAt: true,
      client: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Contamination = the reply's SENDER is on a workspace-internal domain.
  const contaminated = replies.filter((r) => {
    const domain = emailDomain(r.fromEmail);
    return domain !== null && (internalByClient.get(r.clientId)?.has(domain) ?? false);
  });

  // What each one stopped: the linked outbound's enrolment.
  const outboundIds = contaminated
    .map((r) => r.linkedOutboundEmailId)
    .filter((id): id is string => typeof id === "string");
  const stepSends =
    outboundIds.length > 0
      ? await prisma.clientEmailSequenceStepSend.findMany({
          where: { outboundEmailId: { in: outboundIds } },
          select: {
            outboundEmailId: true,
            enrollment: {
              select: { id: true, status: true, completedAt: true },
            },
          },
        })
      : [];
  const enrolByOutbound = new Map(
    stepSends.map((s) => [s.outboundEmailId, s.enrollment]),
  );

  console.log("=== F4 contamination review (READ-ONLY) ===");
  console.log(`Total InboundReply rows scanned: ${replies.length}`);
  console.log(`Likely mislinked internal-sender replies: ${contaminated.length}`);
  if (contaminated.length === 0) {
    console.log("No contamination found. Nothing to review.");
    return;
  }
  console.log(
    "\nReview each below. DO NOT auto-un-stop enrolments — resuming a stopped " +
      "sequence would send new mail. Decide per row.\n",
  );
  for (const r of contaminated) {
    const enrol = r.linkedOutboundEmailId
      ? enrolByOutbound.get(r.linkedOutboundEmailId)
      : undefined;
    console.log(
      [
        `client="${r.client.name}"`,
        `reply=${r.id}`,
        `from=${r.fromEmail}`,
        `to=${r.toEmail ?? "—"}`,
        `match=${r.matchMethod}`,
        `outbound=${r.linkedOutboundEmailId ?? "—"}`,
        `enrolment=${enrol ? `${enrol.id}:${enrol.status}` : "none"}`,
        `received=${r.receivedAt.toISOString()}`,
        `subject="${(r.subject ?? "").slice(0, 60)}"`,
      ].join("  "),
    );
  }
}

main()
  .catch((e) => {
    console.error("f4-contamination-report failed:", e);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
