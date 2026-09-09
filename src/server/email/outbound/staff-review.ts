import "server-only";
import { createHash } from "node:crypto";
import type { OutboundEmail, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { isAutomatedSequenceSend } from "@/lib/email-sequences/send-origin";
import { isStaffEmailAllowed } from "@/lib/staff-email-policy";
import { GENERIC_OUTBOUND_ONLY } from "./generic-outbound-filter";
import { operatorRequeueFailedSendInTransaction } from "./operator-recovery";
import { CROSS_CLIENT_REVIEW, contactHistoryToken, crossClientPayloadToken, loadCrossClientContacts } from "./cross-client-review";
import { triggerOutboundQueueDrain } from "./trigger-queue";

export const STAFF_REVIEWED_SEND_ORIGIN = "STAFF_REVIEWED_SINGLE_EMAIL";
const heldWhere = {
  status: "FAILED" as const,
  providerMessageId: null, dispatchStartedAt: null,
  AND: [GENERIC_OUTBOUND_ONLY, { OR: [
    { lastErrorCode: CROSS_CLIENT_REVIEW },
    { lastErrorCode: "AUTOMATED_SEND_DISABLED", metadata: { path: ["sendOrigin"], equals: "AUTOMATED_SEQUENCE" } },
  ] }],
};

/** Includes all stored send payload and identity, not just its visible label. */
export function heldEmailReviewToken(row: OutboundEmail, historyToken?: string): string {
  return createHash("sha256").update(JSON.stringify([
    row.id, row.clientId, row.mailboxIdentityId, row.contactId, row.campaignId,
    row.fromAddress, row.toEmail, row.subject, row.bodySnapshot, row.metadata,
    row.sendAttempt, row.updatedAt.toISOString(),
    ...(historyToken ? [historyToken] : []),
  ])).digest("hex");
}

/** Call only after authenticating staff and checking the requested client. */
export async function loadHeldEmailsForStaff(clientId: string, page: number) {
  const rows = await prisma.outboundEmail.findMany({
    where: { ...heldWhere, clientId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    skip: page * 10, take: 11,
  });
  return { hasNext: rows.length > 10, emails: await Promise.all(rows.slice(0, 10).map(async row => {
    const contacts = await loadCrossClientContacts(clientId, row.toEmail, new Date());
    return {
    id: row.id, toEmail: row.toEmail, fromAddress: row.fromAddress,
    subject: row.subject, body: row.bodySnapshot, recentContacts: contacts,
    reviewToken: heldEmailReviewToken(row, contacts.length ? contactHistoryToken(contacts) : undefined),
  }; })) };
}

/** The staff identity comes from the authenticated server action, never form input. */
export async function approveHeldEmail(input: { clientId: string; outboundEmailId: string; reviewToken: string; staffUserId: string }) {
  try {
    const approval = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "StaffUser" WHERE id = ${input.staffUserId} FOR SHARE`;
      const staff = await tx.staffUser.findUnique({ where: { id: input.staffUserId } });
      if (!staff?.isActive || !isStaffEmailAllowed(staff)) return { ok: false as const, error: "Your staff access has changed. Sign in again." };
      await tx.$queryRaw`SELECT id FROM "OutboundEmail" WHERE id = ${input.outboundEmailId} AND "clientId" = ${input.clientId} FOR UPDATE`;
      const row = await tx.outboundEmail.findFirst({ where: { ...heldWhere, id: input.outboundEmailId, clientId: input.clientId } });
      if (!row || (row.lastErrorCode !== CROSS_CLIENT_REVIEW && !isAutomatedSequenceSend(row.metadata))) return { ok: false as const, error: "This email is no longer waiting for this review. Refresh the page." };
      const clients = await tx.$queryRaw<Array<{ status: string; deletedAt: Date | null }>>`SELECT status, "deletedAt" FROM "Client" WHERE id = ${input.clientId} FOR SHARE`;
      if (!clients[0] || clients[0].deletedAt || clients[0].status !== "ACTIVE") return { ok: false as const, error: "This client is not active. The email remains held." };
      const contacts = await loadCrossClientContacts(input.clientId, row.toEmail, new Date(), tx);
      if (!row.subject?.trim() || !row.bodySnapshot?.trim() || heldEmailReviewToken(row, contacts.length ? contactHistoryToken(contacts) : undefined) !== input.reviewToken) return { ok: false as const, error: "The saved email or recent contact history changed, or the email is incomplete. Refresh and review it again." };
      const result = await operatorRequeueFailedSendInTransaction(tx, row.id, input.clientId, row.lastErrorCode === CROSS_CLIENT_REVIEW ? CROSS_CLIENT_REVIEW : "AUTOMATED_SEND_DISABLED");
      if (result.count !== 1) return { ok: false as const, error: result.error ?? "The email changed. Refresh before reviewing again." };
      const metadata: Prisma.JsonObject = { ...(row.metadata as Prisma.JsonObject), sendOrigin: STAFF_REVIEWED_SEND_ORIGIN, reviewedAt: new Date().toISOString(), reviewedByStaffUserId: staff.id };
      if (contacts.length) metadata.crossClientApproval = {
        staffUserId: staff.id, historyToken: contactHistoryToken(contacts),
        payloadToken: crossClientPayloadToken({ ...row, metadata }),
      };
      await tx.outboundEmail.update({ where: { id: row.id }, data: {
        staffUserId: staff.id,
        metadata,
      } });
      await tx.auditLog.create({ data: { staffUserId: staff.id, clientId: input.clientId, action: "UPDATE", entityType: "OutboundEmail", entityId: row.id,
        metadata: { kind: "held_email_staff_approval", reviewedContentHash: input.reviewToken, recentContactIds: contacts.map(contact => contact.id) },
      } });
      return { ok: true as const, message: "This email is queued with your approval. Current sending limits and do-not-contact checks still apply. Automatic sending stays unchanged." };
    });
    // Wake only this approved email, after the approval transaction commits.
    if (approval.ok) await triggerOutboundQueueDrain({ clientId: input.clientId, outboundEmailIds: [input.outboundEmailId] });
    return approval;
  } catch {
    return { ok: false as const, uncertain: true as const, error: "We could not confirm the result. Refresh this page before doing anything else." };
  }
}
