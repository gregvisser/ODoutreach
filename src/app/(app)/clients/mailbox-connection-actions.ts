"use server";

import { randomBytes } from "crypto";

import { revalidatePath } from "next/cache";

import { isMailboxRemovedFromWorkspace } from "@/lib/mailbox-workspace-removal";
import { shouldPreserveMailboxCredentialOnConnect } from "@/lib/mailboxes/mailbox-connect-credential";
import { mailboxOAuthStateExpiresAt } from "@/lib/mailboxes/mailbox-oauth-state-expiry";
import { prisma } from "@/lib/db";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import {
  isGoogleMailboxOAuthConfigured,
  isMicrosoftMailboxOAuthConfigured,
} from "@/server/mailbox/oauth-env";
import { auditMailboxConnectionChange } from "@/server/mailbox/mailbox-connection-audit";
import { buildMailboxOAuthAuthorizeUrlForPreparedState } from "@/server/mailbox/mailbox-oauth-authorize-url";
import { reconcilePrimaryMailboxForClient } from "@/server/mailbox/mailbox-primary-consistency";
import { requireClientMailboxMutator } from "@/server/mailbox-identities/mutator-access";

export type MailboxConnectionPrepareResult =
  | { ok: true; startUrl: string }
  | { ok: false; error: string };

/**
 * Begins OAuth: arms the state, returns the URL for browser navigation.
 *
 * A mailbox that can send today keeps its credential and its CONNECTED status
 * for the whole round trip — see `shouldPreserveMailboxCredentialOnConnect`.
 * Anything else is cleared to PENDING_CONNECTION as before.
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
    include: { secret: { select: { id: true } } },
  });
  if (!row) {
    return { ok: false, error: "Mailbox not found." };
  }
  if (isMailboxRemovedFromWorkspace(row)) {
    return {
      ok: false,
      error:
        "This mailbox was removed from the workspace. Use Restore, then run Connect when you are ready to reconnect provider access.",
    };
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
    await prisma.$transaction(async (tx) => {
      await tx.clientMailboxIdentity.update({
        where: { id: row.id },
        data: {
          connectionStatus: "CONNECTION_ERROR",
          lastError: msg,
          oauthState: null,
          oauthStateExpiresAt: null,
        },
      });
      await reconcilePrimaryMailboxForClient(tx, clientId);
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
  // Shared with the callbacks' expiry check, so the lifetime that is written
  // here and the lifetime that is enforced there cannot drift apart.
  const expiresAt = mailboxOAuthStateExpiresAt(new Date());

  // A mailbox that can send today is left exactly as it is while the operator
  // is away at the provider. Starting a sign-in is not a decision to stop
  // sending, and an operator who closes the tab must not leave an outage behind.
  //
  // Nothing is lost by waiting: both callbacks write the new credential with
  // `mailboxIdentitySecret.upsert` on the unique `mailboxIdentityId`, so the
  // replacement is already atomic and there can never be two credentials for one
  // mailbox. The delete that used to sit here was destroying a working
  // credential to make room the upsert did not need.
  const preserveWorkingCredential = shouldPreserveMailboxCredentialOnConnect({
    connectionStatus: row.connectionStatus,
    hasStoredCredential: row.secret !== null,
    isActive: row.isActive,
    workspaceRemovedAt: row.workspaceRemovedAt,
  });

  try {
    await prisma.$transaction(async (tx) => {
      if (!preserveWorkingCredential) {
        await tx.mailboxIdentitySecret.deleteMany({
          where: { mailboxIdentityId: row.id },
        });
      }
      await tx.clientMailboxIdentity.update({
        where: { id: row.id },
        data: {
          oauthState: state,
          oauthStateExpiresAt: expiresAt,
          // The status, the linked provider account and `connectedAt` describe
          // the credential this row still holds. They are only cleared when
          // that credential is.
          ...(preserveWorkingCredential
            ? {}
            : {
                connectionStatus: "PENDING_CONNECTION" as const,
                lastError: null,
                providerLinkedUserId: null,
                connectedAt: null,
              }),
        },
      });
      await reconcilePrimaryMailboxForClient(tx, clientId);
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Save failed";
    return { ok: false, error: msg };
  }

  let startUrl: string;
  try {
    startUrl = buildMailboxOAuthAuthorizeUrlForPreparedState({
      provider: row.provider,
      oauthState: state,
      mailboxEmailNormalized: row.emailNormalized,
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    await prisma.$transaction(async (tx) => {
      await tx.clientMailboxIdentity.update({
        where: { id: row.id },
        data: {
          // Same rule as above: our own failure to build a sign-in URL says
          // nothing about the credential this mailbox already holds, so it does
          // not take a sending mailbox off the air. The in-flight state is
          // dropped and the error is reported either way.
          ...(preserveWorkingCredential
            ? {}
            : { connectionStatus: "CONNECTION_ERROR" as const }),
          lastError:
            `Could not build provider sign-in URL: ${detail}`.slice(0, 4000),
          oauthState: null,
          oauthStateExpiresAt: null,
        },
      });
      await reconcilePrimaryMailboxForClient(tx, clientId);
    });
    revalidatePath(`/clients/${clientId}`);
    return {
      ok: false,
      error:
        "Could not start Microsoft or Google sign-in. Ask an administrator to verify mailbox OAuth environment variables and redirect URIs.",
    };
  }

  await auditMailboxConnectionChange({
    staffUserId: staff.id,
    clientId,
    mailboxId: row.id,
    metadata: {
      kind: "mailbox_oauth_prepare",
      provider: row.provider,
      // Records what was actually written, not what this step used to write.
      // `beforeStatus` and `credentialRetained` are what makes the rule
      // checkable in production: an operator who abandons a reconnect leaves an
      // audit row saying the credential was kept, and the mailbox goes on
      // sending. Without them the audit log cannot tell a preserved mailbox
      // from a cleared one after the fact.
      beforeStatus: row.connectionStatus,
      connectionStatus: preserveWorkingCredential
        ? row.connectionStatus
        : "PENDING_CONNECTION",
      credentialRetained: preserveWorkingCredential,
    },
  });

  revalidatePath(`/clients/${clientId}`);
  return { ok: true, startUrl };
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
  if (isMailboxRemovedFromWorkspace(existing)) {
    return { ok: false, error: "This mailbox was removed from the workspace — nothing to disconnect." };
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
    await reconcilePrimaryMailboxForClient(tx, clientId);
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
