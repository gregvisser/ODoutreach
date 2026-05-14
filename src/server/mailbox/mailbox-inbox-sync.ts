import "server-only";

import { prisma } from "@/lib/db";
import { getGoogleGmailAccessTokenForMailbox } from "@/server/mailbox/google-mailbox-access";
import { fetchGmailInboxMessagesForSync } from "@/server/mailbox/gmail-inbox";
import { getMicrosoftGraphAccessTokenForMailbox } from "@/server/mailbox/microsoft-mailbox-access";
import {
  listMicrosoftGraphInboxMessages,
  mapGraphInboxMessageToRow,
} from "@/server/mailbox/microsoft-graph-inbox";
import { auditMailboxConnectionChange } from "@/server/mailbox/mailbox-connection-audit";
import { processSyncedMessageForReply } from "@/server/mailbox/process-synced-replies";

const DEFAULT_TOP = 25;

export type InboxSyncResult = {
  ok: true;
  ingested: number;
  totalSeen: number;
  repliesLinked: number;
} | { ok: false; error: string };

export async function syncMailboxInboxForMailbox(input: {
  clientId: string;
  mailboxIdentityId: string;
  staffUserId: string | null;
  top?: number;
}): Promise<InboxSyncResult> {
  const mailbox = await prisma.clientMailboxIdentity.findFirst({
    where: { id: input.mailboxIdentityId, clientId: input.clientId },
  });
  if (!mailbox) {
    return { ok: false, error: "Mailbox not found for this workspace." };
  }
  if (mailbox.workspaceRemovedAt) {
    return {
      ok: false,
      error:
        "This address was removed from the workspace. Inbox sync is off; historical messages in OpensDoors stay visible. Restore the mailbox to sync again.",
    };
  }
  if (mailbox.provider === "MICROSOFT") {
    return syncMicrosoftInboxForMailbox(input);
  }
  if (mailbox.provider === "GOOGLE") {
    return syncGoogleInboxForMailbox(input);
  }
  return { ok: false, error: "Inbox fetch is not supported for this mailbox provider." };
}

export async function syncMicrosoftInboxForMailbox(input: {
  clientId: string;
  mailboxIdentityId: string;
  staffUserId: string | null;
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
    items = await listMicrosoftGraphInboxMessages(access, mailbox.emailNormalized, { top });
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
  let repliesLinked = 0;
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
        ...(row.fullBody
          ? {
              bodyText: row.fullBody.bodyText,
              bodyContentType: row.fullBody.bodyContentType,
              fullBodySize: row.fullBody.fullBodySize,
              fullBodySource: row.fullBody.fullBodySource,
              fullBodyFetchedAt: row.fullBody.fullBodyFetchedAt,
            }
          : {}),
      },
      update: {
        toEmail: row.toEmail,
        subject: row.subject,
        bodyPreview: row.bodyPreview,
        receivedAt: row.receivedAt,
        conversationId: row.conversationId,
        metadata: meta,
        ...(row.fullBody
          ? {
              bodyText: row.fullBody.bodyText,
              bodyContentType: row.fullBody.bodyContentType,
              fullBodySize: row.fullBody.fullBodySize,
              fullBodySource: row.fullBody.fullBodySource,
              fullBodyFetchedAt: row.fullBody.fullBodyFetchedAt,
            }
          : {}),
      },
    });
    const replyResult = await processSyncedMessageForReply({
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
    });
    if (replyResult.created) repliesLinked += 1;
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
      repliesLinked,
    },
  });

  return { ok: true, ingested: n, totalSeen: items.length, repliesLinked };
}

export async function syncGoogleInboxForMailbox(input: {
  clientId: string;
  mailboxIdentityId: string;
  staffUserId: string | null;
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
  if (mailbox.provider !== "GOOGLE") {
    return { ok: false, error: "Inbox fetch for this action requires a Google Workspace mailbox." };
  }
  if (mailbox.connectionStatus !== "CONNECTED") {
    return { ok: false, error: "Connect the mailbox before fetching inbox." };
  }

  let access: string;
  try {
    access = await getGoogleGmailAccessTokenForMailbox(mailboxIdentityId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Token error";
    await prisma.clientMailboxIdentity.update({
      where: { id: mailbox.id },
      data: { lastError: msg.slice(0, 4000) },
    });
    return { ok: false, error: msg };
  }

  let rows: Awaited<ReturnType<typeof fetchGmailInboxMessagesForSync>>;
  try {
    rows = await fetchGmailInboxMessagesForSync(access, { maxResults: top });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gmail fetch failed";
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
        provider: "GOOGLE",
        outcome: "error",
        error: msg.slice(0, 500),
      },
    });
    return { ok: false, error: msg };
  }

  let n = 0;
  let repliesLinked = 0;
  for (const row of rows) {
    const meta = row.metadata;
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
        ingestionSource: "GMAIL_API",
      },
      update: {
        toEmail: row.toEmail,
        subject: row.subject,
        snippet: row.snippet,
        bodyPreview: row.bodyPreview,
        receivedAt: row.receivedAt,
        conversationId: row.conversationId,
        metadata: meta,
      },
    });
    const replyResult = await processSyncedMessageForReply({
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
    });
    if (replyResult.created) repliesLinked += 1;
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
      provider: "GOOGLE",
      outcome: "ok",
      ingested: n,
      totalSeen: rows.length,
      repliesLinked,
    },
  });

  return { ok: true, ingested: n, totalSeen: rows.length, repliesLinked };
}

export type ReplySyncBatchResult = {
  processed: number;
  succeeded: number;
  failed: number;
  ingested: number;
  totalSeen: number;
  repliesLinked: number;
  skipped: number;
};

export async function syncActiveMailboxRepliesBatch(input: {
  perMailboxTop?: number;
  maxMailboxes?: number;
  syncOne?: typeof syncMailboxInboxForMailbox;
} = {}): Promise<ReplySyncBatchResult> {
  const perMailboxTop = Math.max(1, Math.min(input.perMailboxTop ?? DEFAULT_TOP, 50));
  const maxMailboxes = Math.max(1, Math.min(input.maxMailboxes ?? 50, 200));
  const syncOne = input.syncOne ?? syncMailboxInboxForMailbox;
  const mailboxes = await prisma.clientMailboxIdentity.findMany({
    where: {
      workspaceRemovedAt: null,
      isActive: true,
      canReceive: true,
      connectionStatus: "CONNECTED",
      provider: { in: ["MICROSOFT", "GOOGLE"] },
      client: { status: "ACTIVE" },
    },
    orderBy: [{ lastSyncAt: "asc" }, { updatedAt: "asc" }],
    take: maxMailboxes,
    select: { id: true, clientId: true },
  });

  let succeeded = 0;
  let failed = 0;
  let ingested = 0;
  let totalSeen = 0;
  let repliesLinked = 0;
  for (const mailbox of mailboxes) {
    const result = await syncOne({
      clientId: mailbox.clientId,
      mailboxIdentityId: mailbox.id,
      staffUserId: null,
      top: perMailboxTop,
    });
    if (result.ok) {
      succeeded += 1;
      ingested += result.ingested;
      totalSeen += result.totalSeen;
      repliesLinked += result.repliesLinked;
    } else {
      failed += 1;
    }
  }

  return {
    processed: mailboxes.length,
    succeeded,
    failed,
    ingested,
    totalSeen,
    repliesLinked,
    skipped: Math.max(0, maxMailboxes - mailboxes.length),
  };
}

export const syncActiveClientMailboxInboxes = syncActiveMailboxRepliesBatch;
