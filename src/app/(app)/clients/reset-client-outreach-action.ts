"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { requireOpensDoorsStaff } from "@/server/auth/staff";

export type OutreachResetCounts = {
  enrollments: number;
  stepSends: number;
  outboundEmails: number;
  inboundReplies: number;
  providerEvents: number;
  sendReservations: number;
};

export type OutreachResetResult =
  | {
      ok: true;
      mode: "preview" | "deleted";
      cutoffIso: string;
      counts: OutreachResetCounts;
    }
  | { ok: false; error: string };

/**
 * ADMIN-only. Deletes pre-production test outreach for one client — every
 * outreach record created strictly before a cutoff date.
 *
 * Scope (all scoped to clientId, createdAt < cutoff):
 *   - ClientEmailSequenceEnrollment (cascades its step-sends)
 *   - ClientEmailSequenceStepSend (explicit, covers any not cascaded)
 *   - OutboundEmail
 *   - InboundReply
 *   - OutboundProviderEvent
 *   - MailboxSendReservation
 *
 * Deliberately PRESERVED:
 *   - Contact rows (the audience — not test activity)
 *   - UnsubscribeToken / suppression (compliance — deleting could let an
 *     opted-out recipient be emailed again)
 *   - Sequences, templates, lists (configuration)
 *
 * Two modes:
 *   - "preview": returns counts only, deletes nothing.
 *   - "delete":  requires the client name as confirmation, then deletes in a
 *     single transaction and writes an audit log entry.
 */
export async function resetClientOutreachBeforeCutoff(input: {
  clientId: string;
  cutoffIso: string;
  mode: "preview" | "delete";
  confirmation?: string;
}): Promise<OutreachResetResult> {
  const staff = await requireOpensDoorsStaff();
  if (staff.role !== "ADMIN") {
    return { ok: false, error: "Only administrators can reset outreach data." };
  }

  const client = await prisma.client.findUnique({
    where: { id: input.clientId },
    select: { id: true, name: true },
  });
  if (!client) {
    return { ok: false, error: "Client not found." };
  }

  const cutoff = new Date(input.cutoffIso);
  if (Number.isNaN(cutoff.getTime())) {
    return { ok: false, error: "Invalid cutoff date." };
  }

  const where = { clientId: client.id, createdAt: { lt: cutoff } };

  const [
    enrollments,
    stepSends,
    outboundEmails,
    inboundReplies,
    providerEvents,
    sendReservations,
  ] = await Promise.all([
    prisma.clientEmailSequenceEnrollment.count({ where }),
    prisma.clientEmailSequenceStepSend.count({ where }),
    prisma.outboundEmail.count({ where }),
    prisma.inboundReply.count({ where }),
    prisma.outboundProviderEvent.count({ where }),
    prisma.mailboxSendReservation.count({ where }),
  ]);

  const counts: OutreachResetCounts = {
    enrollments,
    stepSends,
    outboundEmails,
    inboundReplies,
    providerEvents,
    sendReservations,
  };

  if (input.mode === "preview") {
    return { ok: true, mode: "preview", cutoffIso: cutoff.toISOString(), counts };
  }

  if (input.confirmation?.trim() !== client.name.trim()) {
    return {
      ok: false,
      error: `Confirmation did not match. Type the client name exactly: "${client.name}".`,
    };
  }

  await prisma.$transaction(async (tx) => {
    // Replies, events, reservations reference outbound via SET NULL — delete
    // them first so nothing dangles, then the parents.
    await tx.inboundReply.deleteMany({ where });
    await tx.outboundProviderEvent.deleteMany({ where });
    await tx.mailboxSendReservation.deleteMany({ where });
    // Explicit step-send delete (covers step-sends whose enrollment is newer),
    // then enrollments (cascades any remaining step-sends).
    await tx.clientEmailSequenceStepSend.deleteMany({ where });
    await tx.clientEmailSequenceEnrollment.deleteMany({ where });
    await tx.outboundEmail.deleteMany({ where });
  });

  await prisma.auditLog.create({
    data: {
      staffUserId: staff.id,
      clientId: client.id,
      action: "DELETE",
      entityType: "OutreachData",
      metadata: {
        kind: "reset_pre_production_outreach",
        cutoffIso: cutoff.toISOString(),
        counts,
        triggeredBy: staff.email,
      },
    },
  });

  revalidatePath(`/clients/${client.id}/activity`);
  return { ok: true, mode: "deleted", cutoffIso: cutoff.toISOString(), counts };
}
