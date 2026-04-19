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
      allocationMode: "mailbox_pool";
      aggregateRemainingAfter: number;
      perMailboxCap: number;
      mailboxesUsed: Array<{ mailboxIdentityId: string; email: string; count: number }>;
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

  const mbSummary =
    r.mailboxesUsed.length > 0
      ? ` Mailboxes: ${r.mailboxesUsed.map((m) => `${m.email} (${String(m.count)})`).join(", ")}.`
      : "";

  return {
    ok: true,
    message: `Queued ${String(r.queued)} message(s) via mailbox pool (ledger per mailbox).${mbSummary}${blockSummary} Aggregate remaining capacity today (UTC) across pool: ${String(r.aggregateRemainingAfter)} (≈${String(r.perMailboxCap)}/mailbox when caps match).`,
    queued: r.queued,
    blocked: r.blocked,
    outboundIds: r.outboundIds,
    allocationMode: r.allocationMode,
    aggregateRemainingAfter: r.aggregateRemainingAfter,
    perMailboxCap: r.perMailboxCap,
    mailboxesUsed: r.mailboxesUsed,
  };
}
