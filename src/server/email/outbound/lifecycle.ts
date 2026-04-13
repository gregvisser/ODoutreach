import "server-only";

import type { OutboundEmailStatus } from "@/generated/prisma/enums";

/**
 * Outbound lifecycle — centralized transition rules (not CRM; operational truth only).
 *
 * Terminal (no further provider send attempts for this row’s original intent):
 * - BLOCKED_SUPPRESSION — never sent
 * - FAILED — terminal failure (operator may create a NEW outbound separately)
 * - BOUNCED — provider reported bounce
 *
 * Success path (non-terminal until ops close the loop):
 * - QUEUED → PROCESSING → SENT → DELIVERED (optional) → REPLIED (optional milestone)
 *
 * REPLIED is a conversation milestone; it does not erase BOUNCED/FAILED history if those were set first.
 * Webhooks must not downgrade a stronger terminal truth (e.g. delivered after bounced).
 */

/** States where no ESP API send should be invoked. */
export function isSendPathTerminal(status: OutboundEmailStatus): boolean {
  return (
    status === "BLOCKED_SUPPRESSION" ||
    status === "FAILED" ||
    status === "BOUNCED"
  );
}

/** States where a linked inbound reply may set REPLIED without violating bounce/failed truth. */
export function canApplyReplyMilestone(current: OutboundEmailStatus): boolean {
  if (current === "BLOCKED_SUPPRESSION" || current === "BOUNCED" || current === "FAILED") {
    return false;
  }
  return true;
}

export type WebhookMutationKind =
  | "delivered"
  | "bounced"
  | "failed"
  | "complained"
  | "delayed"
  | "sent_ack"
  | "other";

/**
 * Whether to mutate outbound row for this webhook. Conservative: replays and stale ordering
 * should not overwrite stronger facts. `lastEventAt` is the last applied provider event time on row.
 */
export function planWebhookMutation(input: {
  currentStatus: OutboundEmailStatus;
  kind: WebhookMutationKind;
  eventCreatedAt: Date;
  lastProviderEventAt: Date | null;
}): {
  mode: "apply_status" | "metadata_only" | "skip";
  reason: string;
} {
  const { currentStatus, kind, eventCreatedAt, lastProviderEventAt } = input;

  if (lastProviderEventAt && eventCreatedAt < lastProviderEventAt) {
    return {
      mode: "skip",
      reason: "older_than_last_applied_provider_event",
    };
  }

  if (kind === "delivered") {
    if (currentStatus === "REPLIED") {
      return {
        mode: "metadata_only",
        reason: "delivered_backfill_while_replied",
      };
    }
    if (isSendPathTerminal(currentStatus)) {
      return { mode: "skip", reason: "terminal_status_blocks_delivered" };
    }
    if (["SENT", "PROCESSING", "DELIVERED", "QUEUED", "REQUESTED", "PREPARING"].includes(currentStatus)) {
      if (currentStatus === "QUEUED" || currentStatus === "REQUESTED" || currentStatus === "PREPARING") {
        return { mode: "skip", reason: "delivered_before_send_confirmed" };
      }
      return { mode: "apply_status", reason: "delivered_after_send" };
    }
    return { mode: "skip", reason: "unexpected_status_for_delivered" };
  }

  if (kind === "bounced") {
    if (currentStatus === "REPLIED") {
      return { mode: "skip", reason: "keep_replied_milestone_over_out_of_order_bounce" };
    }
    if (isSendPathTerminal(currentStatus)) {
      return { mode: "metadata_only", reason: "terminal_refresh_only" };
    }
    if (["SENT", "DELIVERED", "PROCESSING", "BOUNCED"].includes(currentStatus)) {
      return { mode: "apply_status", reason: "bounce" };
    }
    return { mode: "skip", reason: "bounce_not_applicable" };
  }

  if (kind === "failed" || kind === "complained") {
    if (currentStatus === "REPLIED") {
      return { mode: "skip", reason: "keep_replied_over_provider_failed" };
    }
    if (isSendPathTerminal(currentStatus)) {
      return { mode: "metadata_only", reason: "terminal_refresh_only" };
    }
    if (["SENT", "DELIVERED", "PROCESSING"].includes(currentStatus)) {
      return { mode: "apply_status", reason: "provider_failure" };
    }
    return { mode: "skip", reason: "failed_event_not_applicable" };
  }

  if (kind === "delayed") {
    if (isSendPathTerminal(currentStatus)) {
      return { mode: "skip", reason: "terminal" };
    }
    return { mode: "metadata_only", reason: "deferred_signal" };
  }

  if (kind === "sent_ack") {
    return { mode: "metadata_only", reason: "sent_echo" };
  }

  return { mode: "metadata_only", reason: "generic_provider_signal" };
}

export function mapEventTypeToKind(eventType: string): WebhookMutationKind {
  const t = eventType.toLowerCase();
  if (t === "email.delivery_delayed" || t.includes("delivery_delayed")) return "delayed";
  if (t === "email.delivered" || t.endsWith(".delivered")) return "delivered";
  if (t === "email.bounced" || t.includes("bounced")) return "bounced";
  if (t === "email.failed") return "failed";
  if (t === "email.complained" || t.includes("complained")) return "complained";
  if (t === "email.sent") return "sent_ack";
  return "other";
}
