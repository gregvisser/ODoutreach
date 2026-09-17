/**
 * Close a support ticket with a reporter-facing reply.
 *
 * Atomically records the resolution and a durable reporter notification, then
 * attempts provider dispatch. Provider acceptance is reported separately from
 * inbox delivery; unknown provider outcomes are retained for inspection.
 *
 *   npm run support:resolve -- <ticketId> --note "reply the reporter reads"
 */
import { resolveSupportTicketWithNotification } from "../../src/server/support/resolve-support-ticket";
import { dispatchSupportTicketNotification } from "../../src/server/support/support-ticket-notifications";
import { prisma } from "../../src/lib/db";

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
