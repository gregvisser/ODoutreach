"use server";

import { revalidatePath } from "next/cache";

import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { requireClientMailboxMutator } from "@/server/mailbox-identities/mutator-access";
import { syncMicrosoftInboxForMailbox } from "@/server/mailbox/mailbox-inbox-sync";

export type InboxSyncActionResult =
  | { ok: true; ingested: number; totalSeen: number }
  | { ok: false; error: string };

/**
 * Fetches recent inbox messages from Microsoft Graph and upserts them for the workspace.
 */
export async function syncMicrosoftInboxForMailboxAction(
  clientId: string,
  mailboxId: string,
): Promise<InboxSyncActionResult> {
  const staff = await requireOpensDoorsStaff();
  try {
    await requireClientMailboxMutator(staff, clientId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Forbidden" };
  }

  const r = await syncMicrosoftInboxForMailbox({
    clientId,
    mailboxIdentityId: mailboxId,
    staffUserId: staff.id,
  });
  revalidatePath(`/clients/${clientId}`);
  if (!r.ok) {
    return { ok: false, error: r.error };
  }
  return { ok: true, ingested: r.ingested, totalSeen: r.totalSeen };
}
