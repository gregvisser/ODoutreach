import "server-only";

import { SEND_GATE_BLOCKED_CODES } from "@/lib/clients/client-send-governance";
import { prisma } from "@/lib/db";

import { planSequenceStepSends } from "./step-sends";

/**
 * Re-plan every sequence step that still carries a stale
 * `[blocked_client_inactive]` block for this client.
 *
 * Called right after a client flips ONBOARDING → ACTIVE. A recipient checked
 * while the client was still onboarding gets its step-send row stamped
 * `[blocked_client_inactive]` by the dispatch governance gate; that stamp is
 * stale the moment the client goes live, but it used to persist until someone
 * manually clicked "Review recipients". This re-runs the (records-only)
 * planner for each affected step so those recipients are re-evaluated against
 * the now-ACTIVE status automatically — they become READY (or pick up an
 * accurate current reason like suppression / cooldown) with no manual step.
 *
 * Safety:
 *   * `planSequenceStepSends` is records-only — it NEVER sends email, reserves
 *     a mailbox, or calls a provider.
 *   * Best-effort and idempotent: a step that can't be re-planned (archived
 *     sequence, no enrollments, …) is skipped, and the manual "Review
 *     recipients" path remains as a fallback.
 *   * Scoped: only steps that actually hold a stale client-inactive block are
 *     touched, so this is a cheap no-op for the common case.
 */
export async function refreshStaleClientInactiveStepSends(params: {
  clientId: string;
  staffUserId: string;
}): Promise<{ stepsRefreshed: number }> {
  const staleSteps = await prisma.clientEmailSequenceStepSend.findMany({
    where: {
      clientId: params.clientId,
      status: { in: ["BLOCKED", "SUPPRESSED"] },
      blockedReason: { contains: SEND_GATE_BLOCKED_CODES.clientInactive },
    },
    select: { sequenceId: true, stepId: true },
    distinct: ["sequenceId", "stepId"],
  });

  let stepsRefreshed = 0;
  for (const step of staleSteps) {
    try {
      await planSequenceStepSends({
        clientId: params.clientId,
        sequenceId: step.sequenceId,
        stepId: step.stepId,
        staffUserId: params.staffUserId,
      });
      stepsRefreshed += 1;
    } catch {
      // Archived sequence, no enrollments, etc. — skip this step; the manual
      // "Review recipients" path still works as a fallback.
    }
  }

  return { stepsRefreshed };
}
