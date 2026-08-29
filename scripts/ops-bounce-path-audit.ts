/**
 * Has a real bounce ever moved OutboundEmail.status to BOUNCED in production,
 * since the fix that made both channels write it (`record-bounce.ts`, PR #279,
 * merged 2026-08-27)?
 *
 *   npm run ops:bounce-path-audit
 *
 * READ-ONLY. It writes nothing, sends nothing and deletes nothing.
 *
 * This is CR-01b: the structural defect (only the ESP webhook stamped
 * `status`, so the mailbox NDR path suppressed a dead address but never moved
 * the reported bounce rate off 0%) was fixed in cycle 39. What has never been
 * checked is whether either channel has actually FIRED on production since —
 * built, wired, reporting success, never observed is this repository's
 * recorded worst habit, and a flag or a webhook can be correctly wired and
 * still never have seen a real event.
 *
 * Reports, for both channels independently:
 *   - OutboundEmail rows carrying status = BOUNCED or a non-null bouncedAt,
 *     with dates, since the fix merged — this is the ESP-webhook-or-NDR
 *     combined signal, since both now write through the same function.
 *   - AuditLog rows from the mailbox NDR path specifically (`SuppressedEmail`
 *     entries whose metadata records `providerEventType: mailbox_sync_ndr`),
 *     which is evidence the NDR channel produced a suppression even on a
 *     REPLIED row that `record-bounce.ts` deliberately leaves un-stamped.
 *
 * Exit code is 0 whether or not any bounce is found: zero bounces is a fact to
 * report, not a probe failure. Non-zero means the probe itself could not run.
 */
import { prisma } from "@/lib/db";

const FIX_MERGED_AT = new Date("2026-08-27T00:00:00Z");

function maskAddress(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  return `${email.slice(0, Math.min(2, at))}***${email.slice(at)}`;
}

async function main(): Promise<void> {
  try {
    const totalSentSinceFix = await prisma.outboundEmail.count({
      where: { sentAt: { gte: FIX_MERGED_AT } },
    });
    const totalSentEver = await prisma.outboundEmail.count({
      where: { sentAt: { not: null } },
    });
    const sendRange = await prisma.outboundEmail.aggregate({
      where: { sentAt: { not: null } },
      _min: { sentAt: true },
      _max: { sentAt: true },
    });

    console.log(
      `Sent since the fix merged (${FIX_MERGED_AT.toISOString().slice(0, 10)}): ${totalSentSinceFix.toLocaleString()}. ` +
        `Sent ever: ${totalSentEver.toLocaleString()}, ${sendRange._min.sentAt?.toISOString() ?? "?"} to ${sendRange._max.sentAt?.toISOString() ?? "?"}.`,
    );

    const bounced = await prisma.outboundEmail.findMany({
      where: {
        OR: [{ status: "BOUNCED" }, { bouncedAt: { not: null } }],
      },
      select: {
        id: true,
        toEmail: true,
        status: true,
        bouncedAt: true,
        bounceCategory: true,
        lastProviderEventType: true,
        providerName: true,
        sentAt: true,
        createdAt: true,
        updatedAt: true,
        mailboxIdentityId: true,
      },
      orderBy: { createdAt: "desc" },
    });

    console.log(
      `\nA. OutboundEmail rows with status=BOUNCED or a non-null bouncedAt (all time): ${bounced.length}`,
    );
    if (bounced.length === 0) {
      console.log(
        "   None, ever. Since the fix stamps status through the same function for both\n" +
          "   channels, this is not 'the webhook channel never fired' — it is that\n" +
          "   neither channel has recorded a bounce since the fix existed to record one.",
      );
    } else {
      for (const row of bounced) {
        const channel = row.bounceCategory?.startsWith("ndr:")
          ? "mailbox NDR"
          : row.lastProviderEventType
            ? "ESP webhook"
            : "unknown";
        // `bouncedAt` is the historical event time (NDR-received / provider-event
        // time) and can predate the fix even for a write the fix itself made —
        // the mailbox NDR path passes through the ORIGINAL event time as `at`.
        // `updatedAt` is when the database row was actually last written, which is
        // the only fact that says whether THIS code path did the writing.
        const stampedByThisCode = row.updatedAt >= FIX_MERGED_AT ? "STATUS WRITE SINCE FIX" : "row not updated since fix";
        console.log(
          `   ${maskAddress(row.toEmail)}  status=${row.status}  channel=${channel}  [${stampedByThisCode}]`,
        );
        console.log(
          `      bouncedAt(event)=${row.bouncedAt?.toISOString() ?? "null"}  bounceCategory=${row.bounceCategory ?? "null"}  ` +
            `mailboxIdentityId=${row.mailboxIdentityId ?? "null"}  createdAt(row)=${row.createdAt.toISOString()}  updatedAt(row)=${row.updatedAt.toISOString()}`,
        );
      }
    }

    // The NDR path's own audit trail — fires even on a REPLIED row that
    // record-bounce.ts deliberately declines to re-stamp, so this can be
    // non-empty even when (A) above is.
    const ndrAudits = await prisma.auditLog.findMany({
      where: {
        entityType: "SuppressedEmail",
        createdAt: { gte: FIX_MERGED_AT },
      },
      select: { id: true, createdAt: true, clientId: true, metadata: true },
      orderBy: { createdAt: "desc" },
    });
    const ndrOnly = ndrAudits.filter((a) => {
      const meta = a.metadata as Record<string, unknown> | null;
      return (
        typeof meta?.providerEventType === "string" &&
        meta.providerEventType === "mailbox_sync_ndr"
      );
    });

    console.log(
      `\nB. AuditLog entries from the mailbox NDR path specifically, since the fix: ${ndrOnly.length} ` +
        `(of ${ndrAudits.length} total SuppressedEmail audit rows since the fix, any source).`,
    );
    for (const a of ndrOnly) {
      const meta = a.metadata as Record<string, unknown>;
      console.log(
        `   ${a.createdAt.toISOString()}  client=${a.clientId}  bounceCategory=${meta.bounceCategory ?? "null"}`,
      );
    }

    console.log("\n--- Verdict ---");
    // A row's `updatedAt` moving past the fix is proof THIS code wrote it — the
    // fix could only ever run after it deployed, whatever the underlying NDR's
    // own historical event time says.
    const sinceFixBounces = bounced.filter((r) => r.updatedAt >= FIX_MERGED_AT);
    if (sinceFixBounces.length > 0 || ndrOnly.length > 0) {
      console.log(
        "OBSERVED: at least one real bounce has been recorded by a live channel since the fix merged.",
      );
    } else {
      console.log(
        "ARMED BUT UNOBSERVED: no bounce has fired through either channel since the fix merged. " +
          "This does not mean either channel is broken — it means production has not yet produced " +
          "a real bounce for the code to react to. What would prove it: keep watching this probe; " +
          "the next real hard bounce on a live mailbox should appear here within one sync cycle.",
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error("Probe failed:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
