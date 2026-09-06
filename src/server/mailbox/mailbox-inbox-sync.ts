import "server-only";
import { InboxCursorExpiredError } from "./inbox-pagination";

import { prisma } from "@/lib/db";
import { getGoogleGmailAccessTokenForMailbox } from "@/server/mailbox/google-mailbox-access";
import { fetchGmailInboxMessagesForSync } from "@/server/mailbox/gmail-inbox";
import { getMicrosoftGraphAccessTokenForMailbox } from "@/server/mailbox/microsoft-mailbox-access";
import {
  listMicrosoftGraphInboxMessages,
  mapGraphInboxMessageToRow,
} from "@/server/mailbox/microsoft-graph-inbox";
import { auditMailboxConnectionChange } from "@/server/mailbox/mailbox-connection-audit";
import { reconcilePrimaryMailboxForClient } from "@/server/mailbox/mailbox-primary-consistency";
import {
  classifyMailboxCredentialFailure,
  mailboxCredentialFailureMessage,
  type MailboxProviderKind,
} from "@/server/mailbox/mailbox-credential-failure";
import { processSyncedMessageForReply } from "@/server/mailbox/process-synced-replies";
import { processSyncedMessageForBounce } from "@/server/mailbox/bounce-detection";
import { mayPersistRawInboundMail } from "@/server/mailbox/mailbox-address-exclusivity";
import { isInternalMail } from "@/lib/inbox/internal-mail";
import {
  isReplyThreadRefSenderGuardEnabled,
  resolveInternalDomainsForClient,
} from "@/server/inbox/internal-domains";

const DEFAULT_TOP = 25;

/**
 * Records a failed sync against the mailbox row — and, when the failure is the
 * credentials rather than the weather, takes the mailbox OUT of CONNECTED.
 *
 * This function is the fix for the worst thing in EIGHT-DEAD-MAILBOXES.md.
 * Before it, both failure paths below wrote `lastError` and nothing else, so a
 * mailbox with a dead refresh token went on reading "Connected" on screen
 * indefinitely — which is what eight production mailboxes did, unnoticed, while
 * failing every fifteen minutes.
 *
 * Reply sync is the only thing that exercises these tokens between campaigns,
 * so it is the only place that can discover the truth. It now writes it down.
 *
 * Two deliberate restraints:
 *
 *  - A non-credential failure (a Graph 503, a timeout) NEVER changes the
 *    status. One bad afternoon at Microsoft must not become thirty-five manual
 *    reconnects.
 *  - The status change and the primary-mailbox reconcile happen in ONE
 *    transaction, because a workspace whose primary mailbox is not CONNECTED
 *    cannot send.
 */
async function recordMailboxSyncFailure(input: {
  mailboxId: string;
  clientId: string;
  provider: MailboxProviderKind;
  staffUserId: string | null;
  error: string;
  /** Fetch failures have already reached the provider, so they count as a check. */
  stampLastSyncAt: boolean;
}): Promise<void> {
  const failure = classifyMailboxCredentialFailure(input.provider, input.error);
  const lastSyncAt = input.stampLastSyncAt ? { lastSyncAt: new Date() } : {};
  // Pulled into a local so it stays narrowed inside the transaction closure.
  const nextStatus = failure.connectionStatus;

  if (!nextStatus) {
    await prisma.clientMailboxIdentity.update({
      where: { id: input.mailboxId },
      data: { lastError: input.error.slice(0, 4000), ...lastSyncAt },
    });
    return;
  }

  const message = mailboxCredentialFailureMessage(input.provider, failure, input.error);
  await prisma.$transaction(async (tx) => {
    await tx.clientMailboxIdentity.update({
      where: { id: input.mailboxId },
      data: {
        connectionStatus: nextStatus,
        lastError: message.slice(0, 4000),
        ...lastSyncAt,
      },
    });
    await reconcilePrimaryMailboxForClient(tx, input.clientId);
  });

  // The status change is a real state change to a client's sending capability.
  // It goes in the audit log so "why did this mailbox stop sending?" has an
  // answer with a timestamp, rather than being inferred from a column.
  await auditMailboxConnectionChange({
    staffUserId: input.staffUserId,
    clientId: input.clientId,
    mailboxId: input.mailboxId,
    metadata: {
      kind: "mailbox_credential_failure",
      provider: input.provider,
      failureKind: failure.kind,
      isPermanent: failure.isPermanent,
      connectionStatus: nextStatus,
      error: input.error.slice(0, 500),
    },
  });
}

export type InboxSyncResult = {
  ok: true;
  ingested: number;
  totalSeen: number;
  repliesLinked: number;
  backlogPending?: boolean;
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
    await recordMailboxSyncFailure({
      mailboxId: mailbox.id,
      clientId,
      provider: "MICROSOFT",
      staffUserId,
      error: msg,
      stampLastSyncAt: false,
    });
    return { ok: false, error: msg };
  }

  let nextCursor: string | null = null;
  let items: Awaited<ReturnType<typeof listMicrosoftGraphInboxMessages>>;
  try {
    items = await listMicrosoftGraphInboxMessages(access, mailbox.emailNormalized, {
      top, maxPages: 1, onContinuation: (cursor) => { nextCursor = cursor; },
    });
    const backlogCursor = mailbox.inboxSyncCursor || nextCursor;
    if (backlogCursor) {
      items.push(...await listMicrosoftGraphInboxMessages(access, mailbox.emailNormalized, {
        top, cursor: backlogCursor, maxPages: 3,
        onContinuation: (cursor) => { nextCursor = cursor; },
      }));
    }
  } catch (e) {
    if (e instanceof InboxCursorExpiredError) {
      await prisma.clientMailboxIdentity.updateMany({ where: { id: mailbox.id, inboxSyncCursor: mailbox.inboxSyncCursor ?? null }, data: { inboxSyncCursor: null } });
    }
    const msg = e instanceof Error ? e.message : "Graph fetch failed";
    // A 401 from Graph can be the credentials, not the request — so this path
    // classifies too, and flips the mailbox out of CONNECTED when it is.
    await recordMailboxSyncFailure({
      mailboxId: mailbox.id,
      clientId,
      provider: "MICROSOFT",
      staffUserId,
      error: msg,
      stampLastSyncAt: true,
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

  const internalDomains = await resolveInternalDomainsForClient(clientId);
  const replySenderGuard = isReplyThreadRefSenderGuardEnabled();
  // E-06 — resolved once per sync, not per message. When this address is live
  // on more than one workspace, only the workspace that had it first keeps a
  // verbatim copy of the inbox; the rest still match their own replies and
  // bounces, both of which are already scoped to their own client.
  const rawStore = await mayPersistRawInboundMail({
    mailboxIdentityId,
    emailNormalized: mailbox.emailNormalized,
  });
  let n = 0;
  let repliesLinked = 0;
  let skippedInternal = 0;
  let bouncesSuppressed = 0;
  let rawCopiesWithheld = 0;
  // Proves the NDR path did not just suppress but also stamped the row the
  // reported bounce rate counts — the half that was silently missing.
  let bouncesStamped = 0;
  for (const raw of items) {
    const row = mapGraphInboxMessageToRow(raw);
    if (!row) continue;
    // H2 — NDR/DSN bounce detection runs BEFORE the internal-mail skip, because
    // an NDR often comes from the tenant's own postmaster (an internal sender)
    // and would otherwise be filtered out. Flag-gated + no-op when off.
    const bounceResult = await processSyncedMessageForBounce({
      clientId,
      mailboxIdentityId,
      providerMessageId: row.providerMessageId,
      fromEmail: row.fromEmail,
      subject: row.subject,
      bodyText: row.fullBody?.bodyText ?? row.bodyPreview ?? row.snippet,
      receivedAt: row.receivedAt,
    });
    if (bounceResult.suppressed) bouncesSuppressed += 1;
    if (bounceResult.statusStamped) bouncesStamped += 1;
    // F4 — internal staff mail (both ends on a workspace domain) is never a
    // prospect conversation: don't store it and don't try to match it.
    if (
      isInternalMail({
        fromEmail: row.fromEmail,
        toEmail: row.toEmail,
        internalDomains,
      })
    ) {
      skippedInternal += 1;
      continue;
    }
    const meta: Record<string, string | null | boolean> = row.metadata;
    if (rawStore.allowed) {
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
    } else {
      rawCopiesWithheld += 1;
    }
    const replyResult = await processSyncedMessageForReply({
      clientId,
      mailboxIdentityId,
      providerMessageId: row.providerMessageId,
      fromEmail: row.fromEmail,
      toEmail: row.toEmail,
      subject: row.subject,
      snippet: row.snippet,
      bodyPreview: row.bodyPreview,
      // The full body, same source the bounce classifier above already uses.
      // Without this, opt-out detection reads a ~240 character preview of an
      // email that averages ~4,000 characters in production.
      bodyText: row.fullBody?.bodyText ?? null,
      receivedAt: row.receivedAt,
      conversationId: row.conversationId,
      inReplyToHeader: row.inReplyToHeader,
      internalDomains,
      requireThreadRefSenderMatch: replySenderGuard,
    });
    if (replyResult.created) repliesLinked += 1;
    n += 1;
  }

  // Compare-and-set prevents overlapping syncs from moving a newer cursor backwards.
  await prisma.clientMailboxIdentity.updateMany({
    where: { id: mailbox.id, inboxSyncCursor: mailbox.inboxSyncCursor ?? null },
    data: { inboxSyncCursor: nextCursor },
  });
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
      backlogPending: nextCursor !== null,
      skippedInternal,
      bouncesSuppressed,
      bouncesStamped,
      // Non-zero means this address is shared with another workspace and this
      // one is not the owner. Recorded so the containment is visible rather
      // than inferred from an absence of rows.
      rawCopiesWithheld,
    },
  });

  return { ok: true, ingested: n, totalSeen: items.length, repliesLinked, backlogPending: nextCursor !== null };
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
    await recordMailboxSyncFailure({
      mailboxId: mailbox.id,
      clientId,
      provider: "GOOGLE",
      staffUserId,
      error: msg,
      stampLastSyncAt: false,
    });
    return { ok: false, error: msg };
  }

  let nextCursor: string | null = null;
  let rows: Awaited<ReturnType<typeof fetchGmailInboxMessagesForSync>>;
  try {
    rows = await fetchGmailInboxMessagesForSync(access, {
      maxResults: top, maxPages: 1, onContinuation: (cursor) => { nextCursor = cursor; },
    });
    const backlogCursor = mailbox.inboxSyncCursor || nextCursor;
    if (backlogCursor) {
      rows.push(...await fetchGmailInboxMessagesForSync(access, {
        maxResults: top, cursor: backlogCursor, maxPages: 3,
        onContinuation: (cursor) => { nextCursor = cursor; },
      }));
    }
  } catch (e) {
    if (e instanceof InboxCursorExpiredError) {
      await prisma.clientMailboxIdentity.updateMany({ where: { id: mailbox.id, inboxSyncCursor: mailbox.inboxSyncCursor ?? null }, data: { inboxSyncCursor: null } });
    }
    const msg = e instanceof Error ? e.message : "Gmail fetch failed";
    // See the Graph path above — a 401 here can be the credentials too.
    await recordMailboxSyncFailure({
      mailboxId: mailbox.id,
      clientId,
      provider: "GOOGLE",
      staffUserId,
      error: msg,
      stampLastSyncAt: true,
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

  const internalDomains = await resolveInternalDomainsForClient(clientId);
  const replySenderGuard = isReplyThreadRefSenderGuardEnabled();
  // E-06 — see the Microsoft path above. Same rule, same one query per sync.
  const rawStore = await mayPersistRawInboundMail({
    mailboxIdentityId,
    emailNormalized: mailbox.emailNormalized,
  });
  let n = 0;
  let repliesLinked = 0;
  let skippedInternal = 0;
  let bouncesSuppressed = 0;
  let rawCopiesWithheld = 0;
  // Proves the NDR path did not just suppress but also stamped the row the
  // reported bounce rate counts — the half that was silently missing.
  let bouncesStamped = 0;
  for (const row of rows) {
    // H2 — NDR/DSN bounce detection (flag-gated, no-op when off). Runs before
    // the internal-mail skip since NDRs can come from an internal postmaster.
    const bounceResult = await processSyncedMessageForBounce({
      clientId,
      mailboxIdentityId,
      providerMessageId: row.providerMessageId,
      fromEmail: row.fromEmail,
      subject: row.subject,
      // Google now fetches a real body too (format=full). Same precedence as
      // the Microsoft path above.
      bodyText: row.fullBody?.bodyText ?? row.bodyPreview ?? row.snippet,
      receivedAt: row.receivedAt,
    });
    if (bounceResult.suppressed) bouncesSuppressed += 1;
    if (bounceResult.statusStamped) bouncesStamped += 1;
    // F4 — internal staff mail (both ends on a workspace domain) is never a
    // prospect conversation: don't store it and don't try to match it.
    if (
      isInternalMail({
        fromEmail: row.fromEmail,
        toEmail: row.toEmail,
        internalDomains,
      })
    ) {
      skippedInternal += 1;
      continue;
    }
    const meta = row.metadata;
    if (rawStore.allowed) {
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
          snippet: row.snippet,
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
    } else {
      rawCopiesWithheld += 1;
    }
    const replyResult = await processSyncedMessageForReply({
      clientId,
      mailboxIdentityId,
      providerMessageId: row.providerMessageId,
      fromEmail: row.fromEmail,
      toEmail: row.toEmail,
      subject: row.subject,
      snippet: row.snippet,
      bodyPreview: row.bodyPreview,
      // Google now carries a real body too - opt-out detection must see it.
      bodyText: row.fullBody?.bodyText ?? null,
      receivedAt: row.receivedAt,
      conversationId: row.conversationId,
      inReplyToHeader: row.inReplyToHeader,
      internalDomains,
      requireThreadRefSenderMatch: replySenderGuard,
    });
    if (replyResult.created) repliesLinked += 1;
    n += 1;
  }

  // Compare-and-set prevents overlapping syncs from moving a newer cursor backwards.
  await prisma.clientMailboxIdentity.updateMany({
    where: { id: mailbox.id, inboxSyncCursor: mailbox.inboxSyncCursor ?? null },
    data: { inboxSyncCursor: nextCursor },
  });
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
      backlogPending: nextCursor !== null,
      skippedInternal,
      bouncesSuppressed,
      bouncesStamped,
      // See the Microsoft path — non-zero means the raw copy was withheld.
      rawCopiesWithheld,
    },
  });

  return { ok: true, ingested: n, totalSeen: rows.length, repliesLinked, backlogPending: nextCursor !== null };
}

export type ReplySyncBatchResult = {
  processed: number;
  succeeded: number;
  failed: number;
  ingested: number;
  totalSeen: number;
  repliesLinked: number;
  skipped: number;
  /**
   * `<address>: <reason>` for each failed mailbox, capped.
   *
   * The count alone sends someone hunting through 35 mailboxes. Live on
   * 2026-08-25 the alert could say "8 of 35 failed" and nothing about which
   * eight — the reason existed at every failure and was discarded one line
   * later. The count is never trimmed; only this list is.
   */
  errors: string[];
};

/** Enough to act on, not enough to flood an alert email. */
const MAX_REPORTED_ERRORS = 20;

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
    // `email` is selected so a failure can name the mailbox. Without it the
    // alert can only report a number.
    select: { id: true, clientId: true, email: true },
  });

  let succeeded = 0;
  let failed = 0;
  let ingested = 0;
  let totalSeen = 0;
  let repliesLinked = 0;
  const errors: string[] = [];
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
      if (errors.length < MAX_REPORTED_ERRORS) {
        errors.push(`${mailbox.email}: ${result.error}`);
      }
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
    errors,
  };
}

export const syncActiveClientMailboxInboxes = syncActiveMailboxRepliesBatch;
