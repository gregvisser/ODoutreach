"use server";

import { revalidatePath } from "next/cache";

import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { requireClientMailboxMutator } from "@/server/mailbox-identities/mutator-access";
import { queueSelectedMailboxInternalProofSend } from "@/server/mailbox/internal-proof-send";

export type InternalProofSendActionResult =
  | {
      ok: true;
      message: string;
      outboundEmailId: string;
      correlationId: string;
      mailboxEmail: string;
      toEmail: string;
      remainingForMailbox: number;
    }
  | { ok: false; error: string };

export async function sendInternalProofAction(
  clientId: string,
  form: {
    mailboxIdentityId: string;
    toEmail: string;
    subject: string;
    bodyText: string;
    confirmationPhrase: string;
  },
): Promise<InternalProofSendActionResult> {
  const staff = await requireOpensDoorsStaff();
  // Mailbox verification proof sends are an owner-only setup/diagnostic tool
  // (the UI card is gated the same way). Re-check server-side so the action
  // can't be POSTed by a non-owner.
  if (!staff.isSuperAdmin) {
    return {
      ok: false,
      error: "Only the owner account can send mailbox verification proofs.",
    };
  }
  try {
    await requireClientMailboxMutator(staff, clientId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Forbidden" };
  }

  const result = await queueSelectedMailboxInternalProofSend({
    staff,
    clientId,
    mailboxIdentityId: form.mailboxIdentityId,
    toEmail: form.toEmail,
    subject: form.subject,
    bodyText: form.bodyText,
    confirmationPhrase: form.confirmationPhrase,
  });

  revalidatePath(`/clients/${clientId}`);
  revalidatePath(`/clients/${clientId}/mailboxes`);
  revalidatePath(`/clients/${clientId}/activity`);
  revalidatePath(`/clients/${clientId}/outreach`);
  revalidatePath("/operations/outbound");
  revalidatePath("/activity");

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  return {
    ok: true,
    message: `Internal proof queued from ${result.mailboxEmail} to ${result.toEmail}. Remaining capacity for this mailbox today: ${String(result.remainingForMailbox)}.`,
    outboundEmailId: result.outboundEmailId,
    correlationId: result.correlationId,
    mailboxEmail: result.mailboxEmail,
    toEmail: result.toEmail,
    remainingForMailbox: result.remainingForMailbox,
  };
}
