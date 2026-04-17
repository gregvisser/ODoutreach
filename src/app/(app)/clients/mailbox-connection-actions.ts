"use server";

import { randomBytes } from "crypto";

import { revalidatePath } from "next/cache";

import type { MailboxProvider } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import {
  isGoogleMailboxOAuthConfigured,
  isMicrosoftMailboxOAuthConfigured,
} from "@/server/mailbox/oauth-env";
import { auditMailboxConnectionChange } from "@/server/mailbox/mailbox-connection-audit";
import { requireClientMailboxMutator } from "@/server/mailbox-identities/mutator-access";

export type MailboxConnectionPrepareResult =
  | { ok: true; startUrl: string }
  | { ok: false; error: string };

const OAUTH_STATE_TTL_MS = 15 * 60 * 1000;

function startPathForProvider(
  provider: MailboxProvider,
  clientId: string,
  mailboxId: string,
): string {
  const p = provider === "MICROSOFT" ? "microsoft" : "google";
  const q = new URLSearchParams({ clientId, mailboxId });
  return `/api/mailbox-oauth/${p}/start?${q.toString()}`;
}

/**
 * Begins OAuth: sets pending state, clears prior secret on reconnect, returns URL for browser navigation.
 */
export async function prepareMailboxOAuthConnection(
  clientId: string,
  mailboxId: string,
): Promise<MailboxConnectionPrepareResult> {
  const staff = await requireOpensDoorsStaff();
  try {
    await requireClientMailboxMutator(staff, clientId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Forbidden" };
  }

  const row = await prisma.clientMailboxIdentity.findFirst({
    where: { id: mailboxId, clientId },
  });
  if (!row) {
    return { ok: false, error: "Mailbox not found." };
  }

  const configured =
    row.provider === "MICROSOFT"
      ? isMicrosoftMailboxOAuthConfigured()
      : isGoogleMailboxOAuthConfigured();

  if (!configured) {
    const msg =
      row.provider === "MICROSOFT"
        ? "Microsoft mailbox OAuth is not configured (set MAILBOX_MICROSOFT_OAUTH_CLIENT_ID and MAILBOX_MICROSOFT_OAUTH_CLIENT_SECRET, and register the redirect URI)."
        : "Google mailbox OAuth is not configured (set MAILBOX_GOOGLE_OAUTH_CLIENT_ID and MAILBOX_GOOGLE_OAUTH_CLIENT_SECRET, and register the redirect URI).";
    await prisma.clientMailboxIdentity.update({
      where: { id: row.id },
      data: {
        connectionStatus: "CONNECTION_ERROR",
        lastError: msg,
        oauthState: null,
        oauthStateExpiresAt: null,
      },
    });
    await auditMailboxConnectionChange({
      staffUserId: staff.id,
      clientId,
      mailboxId: row.id,
      metadata: {
        kind: "mailbox_oauth_prepare_failed",
        provider: row.provider,
        reason: "not_configured",
      },
    });
    revalidatePath(`/clients/${clientId}`);
    return { ok: false, error: msg };
  }

  const state = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + OAUTH_STATE_TTL_MS);

  await prisma.$transaction(async (tx) => {
    await tx.mailboxIdentitySecret.deleteMany({
      where: { mailboxIdentityId: row.id },
    });
    await tx.clientMailboxIdentity.update({
      where: { id: row.id },
      data: {
        oauthState: state,
        oauthStateExpiresAt: expiresAt,
        connectionStatus: "PENDING_CONNECTION",
        lastError: null,
        providerLinkedUserId: null,
        connectedAt: null,
      },
    });
  });

  await auditMailboxConnectionChange({
    staffUserId: staff.id,
    clientId,
    mailboxId: row.id,
    metadata: {
      kind: "mailbox_oauth_prepare",
      provider: row.provider,
      connectionStatus: "PENDING_CONNECTION",
    },
  });

  revalidatePath(`/clients/${clientId}`);
  return { ok: true, startUrl: startPathForProvider(row.provider, clientId, mailboxId) };
}

export type MailboxDisconnectResult = { ok: true } | { ok: false; error: string };

export async function disconnectMailboxIdentity(
  clientId: string,
  mailboxId: string,
): Promise<MailboxDisconnectResult> {
  const staff = await requireOpensDoorsStaff();
  try {
    await requireClientMailboxMutator(staff, clientId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Forbidden" };
  }

  const existing = await prisma.clientMailboxIdentity.findFirst({
    where: { id: mailboxId, clientId },
  });
  if (!existing) {
    return { ok: false, error: "Mailbox not found." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.mailboxIdentitySecret.deleteMany({
      where: { mailboxIdentityId: existing.id },
    });
    await tx.clientMailboxIdentity.update({
      where: { id: existing.id },
      data: {
        connectionStatus: "DISCONNECTED",
        oauthState: null,
        oauthStateExpiresAt: null,
        providerLinkedUserId: null,
        connectedAt: null,
        lastError: null,
        lastSyncAt: null,
      },
    });
  });

  await auditMailboxConnectionChange({
    staffUserId: staff.id,
    clientId,
    mailboxId: existing.id,
    metadata: {
      kind: "mailbox_oauth_disconnect",
      provider: existing.provider,
      beforeStatus: existing.connectionStatus,
    },
  });

  revalidatePath(`/clients/${clientId}`);
  return { ok: true };
}
