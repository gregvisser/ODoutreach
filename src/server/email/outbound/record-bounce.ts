import "server-only";

import type { OutboundEmailStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";

import { planWebhookMutation } from "./lifecycle";

/**
 * The ONE place a bounce is written onto an `OutboundEmail` row.
 *
 * Why this module exists: bounces reach this system down two completely
 * different channels, and until now only one of them stamped the row.
 *
 *   1. ESP webhook (`/api/webhooks/resend`) — stamped the row, so the reported
 *      bounce rate could move. But prospect outreach never goes through Resend:
 *      `prospect-send-transport-guard.ts` forces every prospect-bound row
 *      through Microsoft Graph or Gmail, neither of which posts to that webhook.
 *   2. Mailbox inbox sync (`server/mailbox/bounce-detection.ts`) — reads the
 *      NDR/DSN that Graph/Gmail actually deliver back into the sending mailbox.
 *      It suppressed the dead address correctly but never touched `status`, so
 *      the bounce rate Reports shows was pinned at 0% across 1,209 real sends.
 *
 * One bounce must produce one consistent record whichever channel saw it, so
 * both channels now end here.
 *
 * The transition rules are NOT re-invented: `planWebhookMutation` already
 * encodes them (REPLIED wins over an out-of-order bounce, an already-terminal
 * row is refreshed rather than rewritten, a stale event is ignored). Routing the
 * NDR path through the same planner is what makes the two channels consistent.
 */

export type BounceTarget = {
  id: string;
  status: OutboundEmailStatus;
  lastProviderEventAt: Date | null;
};

export type RecordOutboundBounceInput = {
  outbound: BounceTarget;
  /** When the bounce happened (provider event time, or NDR received time). */
  at: Date;
  /** Provider category, or `ndr:<evidence>` for a mailbox-sync NDR. */
  bounceCategory: string | null;
  /** e.g. "email.bounced" (webhook) or "mailbox_sync_ndr" (inbox sync). */
  providerEventType: string;
  /** Free-text provider status; defaults to `providerEventType`. */
  providerStatus?: string | null;
};

export type RecordOutboundBounceResult = {
  mode: "apply_status" | "metadata_only" | "skip";
  reason: string;
  /** True only when this call wrote `status = BOUNCED` onto the row. */
  statusStamped: boolean;
};

/**
 * Applies the bounce to the row according to `plan`. Split out so the webhook
 * path — which computes its plan once for every event kind and needs the plan
 * for its own audit bookkeeping — writes through the identical statement.
 */
export async function stampOutboundBounce(input: {
  outbound: Pick<BounceTarget, "id">;
  mode: "apply_status" | "metadata_only";
  at: Date;
  bounceCategory: string | null;
  providerEventType: string;
  providerStatus?: string | null;
}): Promise<void> {
  const baseMeta = {
    lastProviderEventType: input.providerEventType,
    providerStatus: input.providerStatus ?? input.providerEventType,
    lastProviderEventAt: input.at,
  };

  await prisma.outboundEmail.update({
    where: { id: input.outbound.id },
    data:
      input.mode === "apply_status"
        ? {
            status: "BOUNCED",
            bouncedAt: input.at,
            bounceCategory: input.bounceCategory,
            ...baseMeta,
          }
        : baseMeta,
  });
}

/**
 * Plan-and-stamp for callers that do not already hold a lifecycle plan (the
 * mailbox NDR path). Returns what it decided so the caller can report it.
 */
export async function recordOutboundBounce(
  input: RecordOutboundBounceInput,
): Promise<RecordOutboundBounceResult> {
  const plan = planWebhookMutation({
    currentStatus: input.outbound.status,
    kind: "bounced",
    eventCreatedAt: input.at,
    lastProviderEventAt: input.outbound.lastProviderEventAt,
  });

  if (plan.mode === "skip") {
    return { mode: "skip", reason: plan.reason, statusStamped: false };
  }

  await stampOutboundBounce({
    outbound: input.outbound,
    mode: plan.mode,
    at: input.at,
    bounceCategory: input.bounceCategory,
    providerEventType: input.providerEventType,
    providerStatus: input.providerStatus,
  });

  return {
    mode: plan.mode,
    reason: plan.reason,
    statusStamped: plan.mode === "apply_status",
  };
}
