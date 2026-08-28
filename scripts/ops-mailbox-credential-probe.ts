/**
 * Is any live mailbox stranded by an abandoned Connect right now?
 *
 *   npm run ops:mailbox-credential-probe
 *
 * READ-ONLY. It writes nothing, sends nothing and deletes nothing.
 *
 * Pressing Connect used to delete a mailbox's stored refresh token and flip the
 * row to PENDING_CONNECTION before the browser had even reached the provider.
 * Sending gates on CONNECTED, so an operator who never came back left a mailbox
 * silently unable to send. This probe answers whether that outage is open in
 * production today — the question that has to be answered before, and
 * separately from, the code change that stops it happening again.
 *
 * It imports the SHIPPED `isStrandedByAbandonedConnect` rather than
 * reimplementing the condition, so a clean probe is evidence about the rule the
 * server action actually applies, not about a copy of it.
 *
 * Addresses are masked — this output gets pasted into logs and cycle notes.
 *
 * Exit code is 0 whether or not stranded mailboxes are found: a stranded
 * mailbox is a fact to report and act on, not a build failure. Non-zero means
 * the probe itself could not run, which is the case worth failing on.
 */
import { prisma } from "@/lib/db";

import {
  isMailboxSendingCredentialLive,
  isStrandedByAbandonedConnect,
  type MailboxConnectCredentialRow,
  type MailboxConnectionStatusValue,
} from "@/lib/mailboxes/mailbox-connect-credential";

function maskAddress(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  return `${email.slice(0, Math.min(2, at))}***${email.slice(at)}`;
}

function ageInDays(from: Date | null, now: Date): string {
  if (!from) return "unknown age";
  const days = Math.floor((now.getTime() - from.getTime()) / 86_400_000);
  if (days < 1) return "today";
  return days === 1 ? "1 day" : `${days} days`;
}

async function main(): Promise<void> {
  const now = new Date();
  try {
    const rows = await prisma.clientMailboxIdentity.findMany({
      where: { client: { deletedAt: null } },
      select: {
        id: true,
        email: true,
        provider: true,
        connectionStatus: true,
        isActive: true,
        isSendingEnabled: true,
        workspaceRemovedAt: true,
        lastSyncAt: true,
        connectedAt: true,
        updatedAt: true,
        oauthStateExpiresAt: true,
        client: { select: { slug: true, status: true } },
        secret: { select: { id: true, updatedAt: true } },
      },
    });

    const decorated = rows.map((r) => {
      const rule: MailboxConnectCredentialRow = {
        connectionStatus: r.connectionStatus as MailboxConnectionStatusValue,
        hasStoredCredential: r.secret !== null,
        isActive: r.isActive,
        workspaceRemovedAt: r.workspaceRemovedAt,
      };
      return { row: r, rule };
    });

    const live = decorated.filter(
      (d) => d.row.workspaceRemovedAt === null && d.row.isActive,
    );

    console.log(
      `Mailbox rows on non-deleted workspaces: ${decorated.length} (${live.length} live: active and not removed).`,
    );

    const byStatus = new Map<string, number>();
    for (const d of live) {
      const key = `${d.row.connectionStatus}${d.rule.hasStoredCredential ? " + credential" : " + NO credential"}`;
      byStatus.set(key, (byStatus.get(key) ?? 0) + 1);
    }
    console.log("\nLive mailboxes by status and stored credential:");
    for (const [key, count] of [...byStatus.entries()].sort()) {
      console.log(`  ${count.toString().padStart(3)}  ${key}`);
    }

    const sendable = live.filter((d) => isMailboxSendingCredentialLive(d.rule));
    console.log(
      `\n${sendable.length} of ${live.length} live mailboxes can send right now (CONNECTED and holding a credential).`,
    );

    // The question this probe was written to answer.
    const stranded = live.filter((d) => isStrandedByAbandonedConnect(d.rule));

    if (stranded.length === 0) {
      console.log(
        "\nNo live mailbox is sitting in PENDING_CONNECTION without a credential. " +
          "The abandoned-Connect outage is NOT open in production right now.",
      );
    } else {
      console.log(
        `\n*** ${stranded.length} live mailbox(es) STRANDED by an unfinished Connect — they cannot send: ***\n`,
      );
      for (const d of stranded) {
        // `lastSyncAt` survives prepare (only Disconnect clears it), so it is
        // the surviving evidence that this mailbox was genuinely working once,
        // as opposed to a new mailbox that was never connected at all.
        const everWorked = d.row.lastSyncAt !== null;
        console.log(
          `  ${maskAddress(d.row.email)}  [${d.row.provider}]  workspace ${d.row.client.slug} (${d.row.client.status})`,
        );
        console.log(
          `      pending since ~${ageInDays(d.row.updatedAt, now)} ago; ` +
            `sending toggle ${d.row.isSendingEnabled ? "ON" : "off"}; ` +
            (everWorked
              ? `PREVIOUSLY WORKING — last inbox sync ${ageInDays(d.row.lastSyncAt, now)} ago`
              : "no inbox sync on record — may never have been connected"),
        );
      }
      console.log(
        "\nEach of these needs somebody to press Connect and complete the provider sign-in. " +
          "Until then the mailbox is out of the sending pool.",
      );
    }

    // Reported separately: a CONNECTED row with no credential is a different
    // fault (the send path will fail at dispatch) and must not be silently
    // folded into the stranded count.
    const connectedNoSecret = live.filter(
      (d) => d.row.connectionStatus === "CONNECTED" && !d.rule.hasStoredCredential,
    );
    if (connectedNoSecret.length > 0) {
      console.log(
        `\n*** ${connectedNoSecret.length} live mailbox(es) read CONNECTED but hold NO credential — they will fail at dispatch: ***`,
      );
      for (const d of connectedNoSecret) {
        console.log(
          `  ${maskAddress(d.row.email)}  [${d.row.provider}]  workspace ${d.row.client.slug}`,
        );
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
