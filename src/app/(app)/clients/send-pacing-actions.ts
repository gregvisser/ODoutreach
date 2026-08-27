"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import {
  DEFAULT_SEND_BATCH_SIZE,
  MAX_SEND_BATCH_SIZE,
} from "@/lib/mailboxes/send-pacing";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { requireClientMailboxMutator } from "@/server/mailbox-identities/mutator-access";

export type SendPacingActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

/**
 * Set (or clear) how many outreach emails this workspace sends at a time.
 *
 * Clearing it returns the workspace to the house default. This setting can only
 * change the SHAPE of a day's sending — a group of four with a gap, rather than
 * a steady drip — never the amount: the pacing gate takes the minimum of the
 * mailbox's daily cap and the paced allowance, so no value here can raise a cap.
 */
export async function setClientSendBatchSizeAction(
  clientId: string,
  batchSize: number | null,
): Promise<SendPacingActionResult> {
  const staff = await requireOpensDoorsStaff();
  try {
    await requireClientMailboxMutator(staff, clientId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Forbidden" };
  }

  const client = await prisma.client.findFirst({
    where: { id: clientId, deletedAt: null },
    select: { id: true },
  });
  if (!client) {
    return { ok: false, error: "Client not found." };
  }

  let value: number | null = null;
  if (batchSize !== null) {
    if (!Number.isFinite(batchSize) || !Number.isInteger(batchSize)) {
      return { ok: false, error: "Enter a whole number of emails." };
    }
    if (batchSize < 1 || batchSize > MAX_SEND_BATCH_SIZE) {
      return {
        ok: false,
        error: `Enter a number between 1 and ${String(MAX_SEND_BATCH_SIZE)}.`,
      };
    }
    value = batchSize;
  }

  await prisma.client.update({
    where: { id: clientId },
    data: { sendBatchSize: value },
  });
  revalidatePath(`/clients/${clientId}/mailboxes`);

  return {
    ok: true,
    message:
      value === null
        ? `Using the standard pace — ${String(DEFAULT_SEND_BATCH_SIZE)} emails at a time.`
        : `Saved. This workspace now sends ${String(value)} ${value === 1 ? "email" : "emails"} at a time, with a gap before the next group.`,
  };
}
