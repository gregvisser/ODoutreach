import "server-only";

import { prisma } from "@/lib/db";

const MAX_ATTEMPTS = 5;
const LEASE_MS = 5 * 60 * 1000;
const PROVIDER_TIMEOUT_MS = 30_000;

export type NotificationDispatchResult =
  | { kind: "accepted"; notificationId: string }
  | { kind: "failed"; notificationId: string; error: string }
  | { kind: "unknown"; notificationId: string; error: string }
  | { kind: "skipped" };

export function formatSupportResolutionDate(date: Date): string {
  return `${new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    dateStyle: "long",
    timeStyle: "short",
  }).format(date)} UK`;
}

export function buildSupportResolutionBody(input: {
  title: string;
  resolutionNote: string;
  resolvedAt: Date;
}): string {
  return [
    "Your ODoutreach support ticket has been resolved.",
    "",
    `Ticket: ${input.title}`,
    `What was fixed: ${input.resolutionNote}`,
    `Resolved: ${formatSupportResolutionDate(input.resolvedAt)}`,
  ].join("\n");
}

function retryAt(attemptCount: number, now: Date): Date {
  const delayMs = Math.min(60 * 60 * 1000, 2 ** Math.max(0, attemptCount - 1) * 60 * 1000);
  return new Date(now.getTime() + delayMs);
}

async function claimNotification(notificationId: string): Promise<{
  id: string;
  recipientEmail: string;
  subject: string;
  body: string;
  attemptCount: number;
} | null> {
  const now = new Date();
  await prisma.supportTicketNotification.updateMany({
    where: { id: notificationId, status: "IN_FLIGHT", leaseUntil: { lte: now } },
    data: { status: "UNKNOWN", leaseUntil: null, nextAttemptAt: null, lastError: "Previous worker lease expired; provider outcome is unknown. Automatic retry is disabled." },
  });
  const leaseUntil = new Date(now.getTime() + LEASE_MS);
  const claimed = await prisma.supportTicketNotification.updateMany({
    where: {
      id: notificationId,
      OR: [
        { status: "PENDING", OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
        { status: "FAILED", nextAttemptAt: { lte: now } },
      ],
    },
    data: { status: "IN_FLIGHT", leaseUntil, attemptCount: { increment: 1 } },
  });
  if (claimed.count !== 1) return null;
  return prisma.supportTicketNotification.findUnique({
    where: { id: notificationId },
    select: { id: true, recipientEmail: true, subject: true, body: true, attemptCount: true },
  });
}

async function markFailed(notificationId: string, error: string, attemptCount: number): Promise<void> {
  const now = new Date();
  const retryable = attemptCount < MAX_ATTEMPTS;
  await prisma.supportTicketNotification.updateMany({
    where: { id: notificationId, status: "IN_FLIGHT" },
    data: {
      status: "FAILED",
      nextAttemptAt: retryable ? retryAt(attemptCount, now) : null,
      leaseUntil: null,
      lastError: error,
    },
  });
}

export function readSupportNotificationProviderConfig(): {
  tenant: string;
  clientId: string;
  secret: string;
  sender: string;
} | null {
  const tenant = process.env.MS_GRAPH_TENANT_ID ?? process.env.AZURE_TENANT_ID;
  const clientId = process.env.MS_GRAPH_CLIENT_ID ?? process.env.AZURE_CLIENT_ID;
  const secret = process.env.MS_GRAPH_CLIENT_SECRET ?? process.env.AZURE_CLIENT_SECRET;
  const sender = process.env.SUPPORT_AGENT_NOTIFY_SENDER?.trim();
  if (!tenant || !clientId || !secret || !sender) return null;
  return { tenant, clientId, secret, sender };
}

export function isSupportNotificationProviderConfigured(): boolean {
  return readSupportNotificationProviderConfig() !== null;
}

export async function dispatchSupportTicketNotification(notificationId: string): Promise<NotificationDispatchResult> {
  const notification = await claimNotification(notificationId);
  if (!notification) return { kind: "skipped" };

  const provider = readSupportNotificationProviderConfig();
  if (!provider || !notification.recipientEmail) {
    const error = "Support notification provider is not configured.";
    await markFailed(notification.id, error, notification.attemptCount);
    return { kind: "failed", notificationId: notification.id, error };
  }

  let sendAttempted = false;
  try {
    const tokenResponse = await fetch(`https://login.microsoftonline.com/${provider.tenant}/oauth2/v2.0/token`, {
      method: "POST",
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: provider.clientId, client_secret: provider.secret, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" }),
    });
    if (!tokenResponse.ok) {
      const error = `Microsoft token request failed (${tokenResponse.status}).`;
      await markFailed(notification.id, error, notification.attemptCount);
      return { kind: "failed", notificationId: notification.id, error };
    }
    const payload = (await tokenResponse.json()) as { access_token?: string };
    if (!payload.access_token) {
      const error = "Microsoft token response contained no access token.";
      await markFailed(notification.id, error, notification.attemptCount);
      return { kind: "failed", notificationId: notification.id, error };
    }

    sendAttempted = true;
    const response = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(provider.sender)}/sendMail`, {
      method: "POST",
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      headers: { Authorization: `Bearer ${payload.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message: { subject: notification.subject, body: { contentType: "Text", content: notification.body }, toRecipients: [{ emailAddress: { address: notification.recipientEmail } }] }, saveToSentItems: true }),
    });
    if (!response.ok) {
      const error = `Microsoft Graph sendMail failed (${response.status}).`;
      if (response.status >= 500) {
        await prisma.supportTicketNotification.updateMany({
          where: { id: notification.id, status: "IN_FLIGHT" },
          data: { status: "UNKNOWN", leaseUntil: null, nextAttemptAt: null, lastError: `${error} Provider outcome is unknown; automatic retry is disabled.` },
        });
        return { kind: "unknown", notificationId: notification.id, error };
      }
      await markFailed(notification.id, error, notification.attemptCount);
      return { kind: "failed", notificationId: notification.id, error };
    }
    const acceptedAt = new Date();
    const persisted = await prisma.supportTicketNotification.updateMany({
      where: { id: notification.id, status: "IN_FLIGHT" },
      data: { status: "ACCEPTED", providerAcceptedAt: acceptedAt, sentAt: acceptedAt, leaseUntil: null, nextAttemptAt: null, lastError: null },
    });
    if (persisted.count !== 1) {
      const error = "Provider accepted the message, but acceptance could not be persisted.";
      await prisma.supportTicketNotification.updateMany({
        where: { id: notification.id, status: "IN_FLIGHT" },
        data: { status: "UNKNOWN", leaseUntil: null, nextAttemptAt: null, lastError: error },
      });
      return { kind: "unknown", notificationId: notification.id, error };
    }
    return { kind: "accepted", notificationId: notification.id };
  } catch {
    if (!sendAttempted) {
      const error = "Microsoft token acquisition failed before sendMail was attempted.";
      await markFailed(notification.id, error, notification.attemptCount);
      return { kind: "failed", notificationId: notification.id, error };
    }
    const error = "Notification provider outcome is unknown; automatic retry is disabled.";
    await prisma.supportTicketNotification.updateMany({
      where: { id: notification.id, status: "IN_FLIGHT" },
      data: { status: "UNKNOWN", leaseUntil: null, nextAttemptAt: null, lastError: error },
    });
    return { kind: "unknown", notificationId: notification.id, error };
  }
}

export async function retryFailedSupportTicketNotification(notificationId: string): Promise<boolean> {
  const result = await prisma.supportTicketNotification.updateMany({
    where: { id: notificationId, status: "FAILED" },
    data: { status: "PENDING", nextAttemptAt: null, leaseUntil: null, lastError: null },
  });
  return result.count === 1;
}

export type NotificationQueueResult = {
  processed: number;
  accepted: number;
  failed: number;
  unknown: number;
  skipped: number;
};

export async function processSupportTicketNotificationQueue(limit = 10): Promise<NotificationQueueResult> {
  const now = new Date();
  await prisma.supportTicketNotification.updateMany({
    where: { status: "IN_FLIGHT", leaseUntil: { lte: now } },
    data: { status: "UNKNOWN", leaseUntil: null, nextAttemptAt: null, lastError: "Previous worker lease expired; provider outcome is unknown. Automatic retry is disabled." },
  });
  const rows = await prisma.supportTicketNotification.findMany({
    where: {
      OR: [
        { status: "PENDING", OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }] },
        { status: "FAILED", nextAttemptAt: { lte: new Date() } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: Math.max(1, Math.min(limit, 50)),
    select: { id: true },
  });
  const summary: NotificationQueueResult = { processed: rows.length, accepted: 0, failed: 0, unknown: 0, skipped: 0 };
  for (const row of rows) {
    const result = await dispatchSupportTicketNotification(row.id);
    summary[result.kind]++;
  }
  return summary;
}
