"use server";

import { revalidatePath } from "next/cache";

import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { requireClientMailboxMutator } from "@/server/mailbox-identities/mutator-access";
import { queueMicrosoftGovernedTestSend } from "@/server/mailbox/governed-test-send";

export type GovernedTestSendActionResult =
  | { ok: true; message: string; correlationId: string; outboundEmailId: string }
  | { ok: false; error: string };

/**
 * Queues a single governed test message (ledger + Microsoft Graph or Gmail API). Recipient must
 * be on an allowlisted internal domain; no prospect/campaign use.
 */
export async function sendMicrosoftGovernedTestAction(
  clientId: string,
  toEmail: string,
): Promise<GovernedTestSendActionResult> {
  const staff = await requireOpensDoorsStaff();
  try {
    await requireClientMailboxMutator(staff, clientId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Forbidden" };
  }

  const r = await queueMicrosoftGovernedTestSend({
    staff,
    clientId,
    toEmail: toEmail.trim(),
  });
  revalidatePath(`/clients/${clientId}`);

  if (!r.ok) {
    return { ok: false, error: r.error };
  }
  if (r.outcome === "blocked_suppression") {
    return { ok: false, error: "This address is on the suppression list and cannot be used for the test." };
  }
  return {
    ok: true,
    message:
      "Test email is queued. It will send through the connected workspace mailbox when the worker runs.",
    correlationId: r.correlationId,
    outboundEmailId: r.outboundEmailId,
  };
}
