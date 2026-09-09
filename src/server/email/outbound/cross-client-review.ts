import "server-only";
import { createHash } from "node:crypto";
import type { OutboundEmail, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { OUTREACH_COOLDOWN_DAYS } from "@/lib/email-sequences/recent-send-cooldown";

export const CROSS_CLIENT_REVIEW = "CROSS_CLIENT_REVIEW";
export type RecentClientContact = { id: string; clientId: string; clientName: string; sentAt: string };

export async function loadCrossClientContacts(clientId: string, email: string, now: Date, db: Pick<Prisma.TransactionClient, "outboundEmail"> = prisma): Promise<RecentClientContact[]> {
  const rows = await db.outboundEmail.findMany({
    where: { clientId: { not: clientId }, toEmail: { equals: email.trim().toLowerCase(), mode: "insensitive" }, sentAt: { gte: new Date(now.getTime() - OUTREACH_COOLDOWN_DAYS * 86400000), not: null } },
    select: { id: true, clientId: true, sentAt: true, client: { select: { name: true } } },
    orderBy: [{ sentAt: "desc" }, { id: "asc" }],
  });
  return rows.map(row => ({ id: row.id, clientId: row.clientId, clientName: row.client.name, sentAt: row.sentAt!.toISOString() }));
}

function hash(value: unknown) {
  // PostgreSQL JSONB normalises object key order. The approval must survive
  // saving/reloading the same payload while still detecting changed values.
  const canonical = JSON.stringify(value, (_key, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]]))
      : item);
  return createHash("sha256").update(canonical).digest("hex");
}
export function contactHistoryToken(contacts: RecentClientContact[]): string {
  return hash(contacts.map(contact => [contact.id, contact.clientId, contact.sentAt]));
}
export function crossClientPayloadToken(row: OutboundEmail): string {
  const metadata = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? { ...row.metadata } : {};
  delete metadata.crossClientApproval;
  return hash([row.id, row.clientId, row.contactId, row.mailboxIdentityId, row.campaignId, row.fromAddress, row.toEmail, row.subject, row.bodySnapshot, metadata]);
}
export function hasCurrentCrossClientApproval(row: OutboundEmail, contacts: RecentClientContact[]): boolean {
  if (!contacts.length) return true;
  const metadata = row.metadata as Prisma.JsonObject | null;
  const approval = metadata?.crossClientApproval as Prisma.JsonObject | undefined;
  return !!approval && typeof approval.staffUserId === "string" &&
    approval.historyToken === contactHistoryToken(contacts) && approval.payloadToken === crossClientPayloadToken(row);
}
