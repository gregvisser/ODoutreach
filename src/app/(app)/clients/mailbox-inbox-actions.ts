"use server";

import { revalidatePath } from "next/cache";

import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { requireClientMailboxMutator } from "@/server/mailbox-identities/mutator-access";
import { syncMailboxInboxForMailbox } from "@/server/mailbox/mailbox-inbox-sync";
import { reportError } from "@/lib/logger";

export type InboxSyncActionResult =
  | { ok: true; ingested: number; totalSeen: number; backlogPending: boolean }
  | { ok: false; error: string };

/**
 * Fetches recent inbox messages from the connected provider (Microsoft Graph or Gmail API)
 * and upserts them for the workspace.
 */
export async function syncMailboxInboxForMailboxAction(
  clientId: string,
  mailboxId: string,
): Promise<InboxSyncActionResult> {
  const staff = await requireOpensDoorsStaff();
  try {
    await requireClientMailboxMutator(staff, clientId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Forbidden" };
  }

  let r: Awaited<ReturnType<typeof syncMailboxInboxForMailbox>>;
  try {
    r = await syncMailboxInboxForMailbox({
      clientId,
      mailboxIdentityId: mailboxId,
      staffUserId: staff.id,
    });
  } catch (error) {
    reportError(error, { operation: "manual_mailbox_reply_sync", clientId, mailboxId });
    r = { ok: false, error: "Reply checking could not finish. Replies already recovered are saved. Please try again; if this continues, ask an administrator to check this mailbox." };
  }
  revalidatePath(`/clients/${clientId}`);
  revalidatePath(`/clients/${clientId}/activity`);
  revalidatePath(`/clients/${clientId}/mailboxes`);
  revalidatePath("/replies");
  if (!r.ok) {
    return { ok: false, error: r.error };
  }
  return { ok: true, ingested: r.ingested, totalSeen: r.totalSeen, backlogPending: r.backlogPending === true };
}
