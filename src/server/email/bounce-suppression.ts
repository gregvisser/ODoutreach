import "server-only";

import { prisma } from "@/lib/db";
import { normalizeEmail } from "@/lib/normalize";

/**
 * Append-only suppression for a HARD-bounced recipient.
 *
 * When the provider reports a permanent bounce we must stop ever sending to
 * that address again — re-contacting a dead mailbox once the 10-day cooldown
 * lapses is a deliverability / sender-reputation risk. This mirrors the
 * unsubscribe redemption side-effects (`performUnsubscribe`) so the address
 * is blocked on the very next send attempt:
 *
 *   * upsert `SuppressedEmail (clientId, email)` with `sourceId = null` so a
 *     governed-sheet re-sync (which only replaces its own source's rows) can
 *     never wipe a bounce suppression — exactly the rule unsubscribe + manual
 *     DNC already use;
 *   * flip `Contact.isSuppressed = true` (+ stamp `lastSuppressionCheckAt`)
 *     for every matching contact in the client so planner / list UIs reflect
 *     the block immediately, without waiting for the next full refresh;
 *   * write ONE `AuditLog` row, but only when the suppression row is newly
 *     created — repeated bounce events for the same address never spam the
 *     audit log (same idempotency stance as `performUnsubscribe`).
 *
 * Idempotent and append-only: safe to call repeatedly, and it never removes
 * or downgrades an existing suppression (a row created by unsubscribe / DNC /
 * sheet sync is left untouched apart from a `syncedAt` refresh).
 *
 * NOTE: this is gated by `isBounceSuppressionEnabled()` at the call site;
 * the writer itself performs no flag check so it stays directly testable.
 */
export type HardBounceSuppressionInput = {
  clientId: string;
  /** Raw recipient address (e.g. `OutboundEmail.toEmail`); normalized here. */
  email: string;
  /** Owning contact, if the outbound was linked to one. */
  contactId?: string | null;
  /** The bounced outbound — recorded in the audit metadata for traceability. */
  outboundEmailId: string;
  /** Provider bounce category/type (audit only). */
  bounceCategory?: string | null;
  /** Provider event type that triggered this (e.g. "email.bounced"). */
  providerEventType: string;
  /** Event timestamp — used for syncedAt / lastSuppressionCheckAt. */
  at: Date;
  /**
   * What triggered the permanent suppression — a hard bounce (default) or a
   * spam complaint. Drives the audit metadata `kind`. Both append-only +
   * idempotent; a spam complaint is the strongest opt-out signal, so it
   * suppresses unconditionally (no flag) — we must never email a complainer.
   */
  reason?: "hard_bounce" | "complaint";
};

export type HardBounceSuppressionResult = {
  /** True when the address is on the suppression list after this call. */
  suppressed: boolean;
  /** True only when THIS call created the SuppressedEmail row. */
  newlyCreated: boolean;
  normalizedEmail: string;
  /** Number of Contact rows flipped to isSuppressed by this call. */
  contactsFlagged: number;
};

export async function suppressRecipientForHardBounce(
  input: HardBounceSuppressionInput,
): Promise<HardBounceSuppressionResult> {
  const email = normalizeEmail(input.email);

  // Defensive no-op: never normalize/suppress an empty address or a send
  // with no resolvable tenant. (The webhook path already guards both.)
  if (!input.clientId || email.length === 0) {
    return {
      suppressed: false,
      newlyCreated: false,
      normalizedEmail: email,
      contactsFlagged: 0,
    };
  }

  return prisma.$transaction(async (tx) => {
    const existing = await tx.suppressedEmail.findUnique({
      where: { clientId_email: { clientId: input.clientId, email } },
      select: { id: true },
    });

    if (existing) {
      // Already suppressed (prior bounce, unsubscribe, DNC, or sheet sync).
      // Refresh the timestamp only — never touch sourceId, never duplicate,
      // never re-audit. Append-only: we never clear the row.
      await tx.suppressedEmail.update({
        where: { id: existing.id },
        data: { syncedAt: input.at },
      });
    } else {
      await tx.suppressedEmail.create({
        data: {
          clientId: input.clientId,
          email,
          // sourceId intentionally null — not from a governed SuppressionSource
          // sync, so a sheet re-sync can never delete this. Mirrors unsubscribe.
          sourceId: null,
          syncedAt: input.at,
        },
      });
    }

    // Flag every matching contact in this client (case-insensitive) so the
    // cached `isSuppressed` the planner reads is correct immediately. The
    // send-time gate reads the suppression table directly, so sends are
    // blocked even before/independent of this flag.
    const flagged = await tx.contact.updateMany({
      where: {
        clientId: input.clientId,
        email: { equals: email, mode: "insensitive" },
      },
      data: { isSuppressed: true, lastSuppressionCheckAt: input.at },
    });

    // Audit only the first time we suppress this address — keeps repeated
    // bounce events from spamming the log (mirrors performUnsubscribe).
    if (!existing) {
      await tx.auditLog.create({
        data: {
          // System-initiated (provider webhook) — no staff user, matching
          // other system-initiated audit rows.
          staffUserId: null,
          clientId: input.clientId,
          action: "CREATE",
          entityType: "SuppressedEmail",
          entityId: null,
          metadata: {
            kind:
              input.reason === "complaint"
                ? "complaint_suppressed"
                : "hard_bounce_suppressed",
            email,
            contactId: input.contactId ?? null,
            outboundEmailId: input.outboundEmailId,
            bounceCategory: input.bounceCategory ?? null,
            providerEventType: input.providerEventType,
          },
        },
      });
    }

    return {
      suppressed: true,
      newlyCreated: !existing,
      normalizedEmail: email,
      contactsFlagged: flagged.count,
    };
  });
}
