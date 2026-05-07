import { isMailboxRemovedFromWorkspace } from "@/lib/mailbox-workspace-removal";
import { prisma } from "@/lib/db";
import { tryGetOpensDoorsStaff } from "@/server/auth/staff";
import { exchangeMicrosoftMailboxAuthCode } from "@/server/mailbox/microsoft-mailbox-oauth";
import { auditMailboxConnectionChange } from "@/server/mailbox/mailbox-connection-audit";
import { mailboxOAuthRedirectToClient } from "@/server/mailbox/mailbox-oauth-callback-shared";
import { resolveMicrosoftMailboxOAuthConnection } from "@/server/mailbox/mailbox-oauth-microsoft-resolve";
import { encryptMailboxCredentialJson } from "@/server/mailbox/oauth-crypto";
import { reconcilePrimaryMailboxForClient } from "@/server/mailbox/mailbox-primary-consistency";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const err = url.searchParams.get("error");
  const state = url.searchParams.get("state")?.trim();
  const code = url.searchParams.get("code")?.trim();

  if (!state) {
    return mailboxOAuthRedirectToClient("", {
      mailbox_oauth: "error",
      reason: "missing_state",
    });
  }

  const mailbox = await prisma.clientMailboxIdentity.findFirst({
    where: { oauthState: state },
  });

  if (!mailbox) {
    return mailboxOAuthRedirectToClient("", {
      mailbox_oauth: "error",
      reason: "unknown_state",
    });
  }

  const clientId = mailbox.clientId;

  if (isMailboxRemovedFromWorkspace(mailbox)) {
    return mailboxOAuthRedirectToClient(clientId, {
      mailbox_oauth: "error",
      reason: "mailbox_removed",
    });
  }

  if (err) {
    const desc = url.searchParams.get("error_description") ?? err;
    await prisma.$transaction(async (tx) => {
      await tx.clientMailboxIdentity.update({
        where: { id: mailbox.id },
        data: {
          connectionStatus: "CONNECTION_ERROR",
          lastError: `Microsoft OAuth: ${desc}`.slice(0, 4000),
          oauthState: null,
          oauthStateExpiresAt: null,
        },
      });
      await reconcilePrimaryMailboxForClient(tx, clientId);
    });
    const staff = await tryGetOpensDoorsStaff();
    const staffId = staff?.id ?? null;
    await auditMailboxConnectionChange({
      staffUserId: staffId,
      clientId,
      mailboxId: mailbox.id,
      metadata: {
        kind: "mailbox_oauth_callback",
        provider: "MICROSOFT",
        outcome: "provider_error",
        error: err,
      },
    });
    return mailboxOAuthRedirectToClient(clientId, {
      mailbox_oauth: "error",
      reason: "provider_denied",
    });
  }

  if (!code) {
    return mailboxOAuthRedirectToClient(clientId, {
      mailbox_oauth: "error",
      reason: "missing_code",
    });
  }

  const callbackStaff = await tryGetOpensDoorsStaff();
  const staffId = callbackStaff?.id ?? null;

  try {
    const tokens = await exchangeMicrosoftMailboxAuthCode(code);
    if (!tokens.refresh_token) {
      throw new Error(
        "Microsoft did not return a refresh token — ensure offline_access scope and consent.",
      );
    }
    const resolved = await resolveMicrosoftMailboxOAuthConnection({
      accessToken: tokens.access_token,
      mailboxEmailNormalized: mailbox.emailNormalized,
    });

    const now = Date.now();
    const expiresAt =
      typeof tokens.expires_in === "number"
        ? now + tokens.expires_in * 1000
        : null;

    const encrypted = encryptMailboxCredentialJson({
      v: 1,
      provider: "MICROSOFT",
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token,
      accessTokenExpiresAt: expiresAt,
      scope: tokens.scope ?? null,
    });

    await prisma.$transaction(async (tx) => {
      await tx.mailboxIdentitySecret.upsert({
        where: { mailboxIdentityId: mailbox.id },
        create: {
          mailboxIdentityId: mailbox.id,
          provider: "MICROSOFT",
          encryptedCredential: encrypted,
        },
        update: {
          provider: "MICROSOFT",
          encryptedCredential: encrypted,
        },
      });
      await tx.clientMailboxIdentity.update({
        where: { id: mailbox.id },
        data: {
          connectionStatus: "CONNECTED",
          oauthState: null,
          oauthStateExpiresAt: null,
          providerLinkedUserId: resolved.mailboxGraphUserId,
          connectedAt: new Date(),
          lastError: null,
        },
      });
      await reconcilePrimaryMailboxForClient(tx, clientId);
    });

    await auditMailboxConnectionChange({
      staffUserId: staffId,
      clientId,
      mailboxId: mailbox.id,
      metadata: {
        kind: "mailbox_oauth_callback",
        provider: "MICROSOFT",
        outcome: "connected",
        providerLinkedUserId: resolved.mailboxGraphUserId,
        oauthMicrosoftActorEmail: resolved.oauthPrimaryEmail,
      },
    });

    return mailboxOAuthRedirectToClient(clientId, {
      mailbox_oauth: "connected",
      oauth_mailbox_id: mailbox.id,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "OAuth failed";
    await prisma.$transaction(async (tx) => {
      await tx.clientMailboxIdentity.update({
        where: { id: mailbox.id },
        data: {
          connectionStatus: "CONNECTION_ERROR",
          lastError: msg.slice(0, 4000),
          oauthState: null,
          oauthStateExpiresAt: null,
        },
      });
      await reconcilePrimaryMailboxForClient(tx, clientId);
    });
    await auditMailboxConnectionChange({
      staffUserId: staffId,
      clientId,
      mailboxId: mailbox.id,
      metadata: {
        kind: "mailbox_oauth_callback",
        provider: "MICROSOFT",
        outcome: "failed",
      },
    });
    return mailboxOAuthRedirectToClient(clientId, {
      mailbox_oauth: "error",
      reason: "callback_failed",
    });
  }
}
