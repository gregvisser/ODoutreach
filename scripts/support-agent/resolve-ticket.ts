/**
 * Close a support ticket with a reporter-facing reply.
 *
 * Atomically records the resolution and a durable reporter notification, then
 * attempts provider dispatch only when Graph/sender credentials are present.
 * The support-agent runner deliberately does not receive those credentials;
 * in that case the row stays PENDING for `process-support-ticket-notifications.yml`.
 * Provider acceptance is reported separately from inbox delivery.
 *
 *   npm run support:resolve -- <ticketId> --note "reply the reporter reads"
 */
import "./_db";
import { prisma } from "../../src/lib/db";
import { resolveSupportTicketWithNotification } from "../../src/server/support/resolve-support-ticket";
import {
  dispatchSupportTicketNotification,
  isSupportNotificationProviderConfigured,
} from "../../src/server/support/support-ticket-notifications";

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
  const result = await resolveSupportTicketWithNotification({ ticketId: id, resolutionNote: note });
  if (!isSupportNotificationProviderConfigured()) {
    // Ticket is resolved. Leave the durable outbox PENDING for the dedicated
    // notifications worker instead of burning a FAILED attempt and exiting 1.
    console.log(JSON.stringify({ resolved: id, notification: "queued" }));
    return;
  }
  const delivery = await dispatchSupportTicketNotification(result.notificationId);
  console.log(JSON.stringify({ resolved: id, notification: delivery.kind }));
  if (delivery.kind === "failed" || delivery.kind === "unknown") process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
