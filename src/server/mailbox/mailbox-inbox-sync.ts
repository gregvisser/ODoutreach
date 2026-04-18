import "server-only";

import { prisma } from "@/lib/db";
import { getMicrosoftGraphAccessTokenForMailbox } from "@/server/mailbox/microsoft-mailbox-access";
import {
  listMicrosoftGraphInboxMessages,
  mapGraphInboxMessageToRow,
} from "@/server/mailbox/microsoft-graph-inbox";
import { auditMailboxConnectionChange } from "@/server/mailbox/mailbox-connection-audit";

const DEFAULT_TOP = 25;

export type InboxSyncResult = {
  ok: true;
  ingested: number;
  totalSeen: number;
} | { ok: false; error: string };

export async function syncMicrosoftInboxForMailbox(input: {
  clientId: string;
  mailboxIdentityId: string;
  staffUserId: string;
  top?: number;
}): Promise<InboxSyncResult> {
  const { clientId, mailboxIdentityId, staffUserId } = input;
  const top = input.top ?? DEFAULT_TOP;

  const mailbox = await prisma.clientMailboxIdentity.findFirst({
    where: { id: mailboxIdentityId, clientId },
  });
  if (!mailbox) {
    return { ok: false, error: "Mailbox not found for this workspace." };
  }
  if (mailbox.provider !== "MICROSOFT") {
    return { ok: false, error: "Inbox fetch is only supported for Microsoft 365 mailboxes in this slice." };
  }
  if (mailbox.connectionStatus !== "CONNECTED") {
    return { ok: false, error: "Connect the mailbox before fetching inbox." };
  }

  let access: string;
  try {
    access = await getMicrosoftGraphAccessTokenForMailbox(mailboxIdentityId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Token error";
    await prisma.clientMailboxIdentity.update({
      where: { id: mailbox.id },
      data: { lastError: msg.slice(0, 4000) },
    });
    return { ok: false, error: msg };
  }

  let items: Awaited<ReturnType<typeof listMicrosoftGraphInboxMessages>>;
  try {
    items = await listMicrosoftGraphInboxMessages(access, { top });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Graph fetch failed";
    const now = new Date();
    await prisma.clientMailboxIdentity.update({
      where: { id: mailbox.id },
      data: { lastError: msg.slice(0, 4000), lastSyncAt: now },
    });
    await auditMailboxConnectionChange({
      staffUserId,
      clientId,
      mailboxId: mailbox.id,
      metadata: {
        kind: "mailbox_inbox_sync",
        provider: "MICROSOFT",
        outcome: "error",
        error: msg.slice(0, 500),
      },
    });
    return { ok: false, error: msg };
  }

  let n = 0;
  for (const raw of items) {
    const row = mapGraphInboxMessageToRow(raw);
    if (!row) continue;
    const meta: Record<string, string | null | boolean> = row.metadata;
    await prisma.inboundMailboxMessage.upsert({
      where: {
        mailboxIdentityId_providerMessageId: {
          mailboxIdentityId,
          providerMessageId: row.providerMessageId,
        },
      },
      create: {
        clientId,
        mailboxIdentityId,
        providerMessageId: row.providerMessageId,
        fromEmail: row.fromEmail,
        toEmail: row.toEmail,
        subject: row.subject,
        snippet: row.snippet,
        bodyPreview: row.bodyPreview,
        receivedAt: row.receivedAt,
        conversationId: row.conversationId,
        metadata: meta,
        ingestionSource: "MICROSOFT_GRAPH",
      },
      update: {
        toEmail: row.toEmail,
        subject: row.subject,
        bodyPreview: row.bodyPreview,
        receivedAt: row.receivedAt,
        conversationId: row.conversationId,
        metadata: meta,
      },
    });
    n += 1;
  }

  const now = new Date();
  await prisma.clientMailboxIdentity.update({
    where: { id: mailbox.id },
    data: { lastSyncAt: now, lastError: null },
  });
  await auditMailboxConnectionChange({
    staffUserId,
    clientId,
    mailboxId: mailbox.id,
    metadata: {
      kind: "mailbox_inbox_sync",
      provider: "MICROSOFT",
      outcome: "ok",
      ingested: n,
      totalSeen: items.length,
    },
  });

  return { ok: true, ingested: n, totalSeen: items.length };
}
