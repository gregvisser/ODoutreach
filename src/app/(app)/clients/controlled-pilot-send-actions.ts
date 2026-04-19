"use server";

import { revalidatePath } from "next/cache";

import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { requireClientMailboxMutator } from "@/server/mailbox-identities/mutator-access";
import { queueControlledPilotBatch } from "@/server/mailbox/controlled-pilot-send";

export type ControlledPilotSendActionResult =
  | {
      ok: true;
      message: string;
      queued: number;
      blocked: Array<{ email: string; reason: string }>;
      outboundIds: string[];
      mailboxEmail: string;
      remainingCapacity: number;
      cap: number;
    }
  | { ok: false; error: string };

export async function submitControlledPilotBatchAction(
  clientId: string,
  form: {
    confirmationPhrase: string;
    recipientLines: string;
    subject: string;
    bodyText: string;
  },
): Promise<ControlledPilotSendActionResult> {
  const staff = await requireOpensDoorsStaff();
  try {
    await requireClientMailboxMutator(staff, clientId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Forbidden" };
  }

  const r = await queueControlledPilotBatch({
    staff,
    clientId,
    confirmationPhrase: form.confirmationPhrase.trim(),
    recipientLines: form.recipientLines,
    subject: form.subject,
    bodyText: form.bodyText,
  });

  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/activity");

  if (!r.ok) {
    return { ok: false, error: r.error };
  }

  const blockSummary =
    r.blocked.length > 0
      ? ` ${String(r.blocked.length)} skipped (${r.blocked.map((b) => `${b.email}: ${b.reason}`).join("; ")}).`
      : "";

  return {
    ok: true,
    message: `Queued ${String(r.queued)} message(s) through ${r.mailboxEmail}.${blockSummary} Remaining capacity today (UTC): ${String(r.remainingCapacity)} / ${String(r.cap)}.`,
    queued: r.queued,
    blocked: r.blocked,
    outboundIds: r.outboundIds,
    mailboxEmail: r.mailboxEmail,
    remainingCapacity: r.remainingCapacity,
    cap: r.cap,
  };
}
