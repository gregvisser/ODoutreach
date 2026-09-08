import "server-only";
import { createHash } from "node:crypto";
import type { OutboundEmail, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { isAutomatedSequenceSend } from "@/lib/email-sequences/send-origin";
import { isStaffEmailAllowed } from "@/lib/staff-email-policy";
import { GENERIC_OUTBOUND_ONLY } from "./generic-outbound-filter";
import { operatorRequeueFailedSendInTransaction } from "./operator-recovery";

export const STAFF_REVIEWED_SEND_ORIGIN = "STAFF_REVIEWED_SINGLE_EMAIL";
const heldWhere = {
  status: "FAILED" as const, lastErrorCode: "AUTOMATED_SEND_DISABLED",
  providerMessageId: null, dispatchStartedAt: null,
  AND: [GENERIC_OUTBOUND_ONLY, { metadata: { path: ["sendOrigin"], equals: "AUTOMATED_SEQUENCE" } }],
};

/** Includes all stored send payload and identity, not just its visible label. */
export function heldEmailReviewToken(row: OutboundEmail): string {
  return createHash("sha256").update(JSON.stringify([
    row.id, row.clientId, row.mailboxIdentityId, row.contactId, row.campaignId,
    row.fromAddress, row.toEmail, row.subject, row.bodySnapshot, row.metadata,
    row.sendAttempt, row.updatedAt.toISOString(),
  ])).digest("hex");
}

/** Call only after authenticating staff and checking the requested client. */
export async function loadHeldEmailsForStaff(clientId: string, page: number) {
  const rows = await prisma.outboundEmail.findMany({
    where: { ...heldWhere, clientId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    skip: page * 10, take: 11,
  });
  return { hasNext: rows.length > 10, emails: rows.slice(0, 10).map(row => ({
    id: row.id, toEmail: row.toEmail, fromAddress: row.fromAddress,
    subject: row.subject, body: row.bodySnapshot, reviewToken: heldEmailReviewToken(row),
  })) };
}

/** The staff identity comes from the authenticated server action, never form input. */
export async function approveHeldEmail(input: { clientId: string; outboundEmailId: string; reviewToken: string; staffUserId: string }) {
  try {
    return await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "StaffUser" WHERE id = ${input.staffUserId} FOR SHARE`;
      const staff = await tx.staffUser.findUnique({ where: { id: input.staffUserId } });
      if (!staff?.isActive || !isStaffEmailAllowed(staff)) return { ok: false as const, error: "Your staff access has changed. Sign in again." };
      await tx.$queryRaw`SELECT id FROM "OutboundEmail" WHERE id = ${input.outboundEmailId} AND "clientId" = ${input.clientId} FOR UPDATE`;
      const row = await tx.outboundEmail.findFirst({ where: { ...heldWhere, id: input.outboundEmailId, clientId: input.clientId } });
      if (!row || !isAutomatedSequenceSend(row.metadata)) return { ok: false as const, error: "This email is no longer waiting for this review. Refresh the page." };
      const clients = await tx.$queryRaw<Array<{ status: string; deletedAt: Date | null }>>`SELECT status, "deletedAt" FROM "Client" WHERE id = ${input.clientId} FOR SHARE`;
      if (!clients[0] || clients[0].deletedAt || clients[0].status !== "ACTIVE") return { ok: false as const, error: "This client is not active. The email remains held." };
      if (!row.subject?.trim() || !row.bodySnapshot?.trim() || heldEmailReviewToken(row) !== input.reviewToken) return { ok: false as const, error: "The saved email changed or is incomplete. Refresh and review it again." };
      const result = await operatorRequeueFailedSendInTransaction(tx, row.id, input.clientId, "AUTOMATED_SEND_DISABLED");
      if (result.count !== 1) return { ok: false as const, error: result.error ?? "The email changed. Refresh before reviewing again." };
      const metadata = row.metadata as Prisma.JsonObject;
      await tx.outboundEmail.update({ where: { id: row.id }, data: {
        staffUserId: staff.id,
        metadata: { ...metadata, sendOrigin: STAFF_REVIEWED_SEND_ORIGIN, reviewedAt: new Date().toISOString(), reviewedByStaffUserId: staff.id },
      } });
      await tx.auditLog.create({ data: { staffUserId: staff.id, clientId: input.clientId, action: "UPDATE", entityType: "OutboundEmail", entityId: row.id,
        metadata: { kind: "held_email_staff_approval", reviewedContentHash: input.reviewToken },
      } });
      return { ok: true as const, message: "This email is queued with your approval. Current sending limits and do-not-contact checks still apply. Automatic sending stays unchanged." };
    });
  } catch {
    return { ok: false as const, uncertain: true as const, error: "We could not confirm the result. Refresh this page before doing anything else." };
  }
}
