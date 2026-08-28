import { isMailboxRemovedFromWorkspace } from "@/lib/mailbox-workspace-removal";
import { prisma } from "@/lib/db";
import { tryGetOpensDoorsStaff } from "@/server/auth/staff";
import {
  exchangeGoogleMailboxAuthCode,
  fetchGoogleUserEmailAndSub,
} from "@/server/mailbox/google-mailbox-oauth";
import { auditMailboxConnectionChange } from "@/server/mailbox/mailbox-connection-audit";
import {
  MAILBOX_OAUTH_ACCOUNT_MISMATCH_REASON,
  MAILBOX_OAUTH_EXPIRED_STATE_REASON,
} from "@/lib/mailboxes/mailbox-oauth-banner-message";
import { isMailboxOAuthStateExpired } from "@/lib/mailboxes/mailbox-oauth-state-expiry";
import {
  MailboxOAuthAccountMismatchError,
  mailboxOAuthRedirectToClient,
} from "@/server/mailbox/mailbox-oauth-callback-shared";
import { verifyGoogleMailboxOAuthForWorkspaceRow } from "@/server/mailbox/mailbox-oauth-google-verify";
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

  // Every error redirect from here down carries the mailbox id. The page reads
  // the row's provider from it, so the banner can say Google when it means
  // Google — until 2026-08-28 it just assumed Microsoft.

  // The 15-minute expiry the prepare step writes, finally read. This sits FIRST,
  // immediately after the lookup: nothing may reason about or act on a state
  // before its age has been checked, so no later edit can slip work in front of
  // the gate. The refusal writes nothing — the state is already dead, and a
  // read-only refusal keeps the message the same if the operator refreshes.
  if (isMailboxOAuthStateExpired(mailbox.oauthStateExpiresAt, new Date())) {
    return mailboxOAuthRedirectToClient(clientId, {
      mailbox_oauth: "error",
      reason: MAILBOX_OAUTH_EXPIRED_STATE_REASON,
      oauth_mailbox_id: mailbox.id,
    });
  }

  if (isMailboxRemovedFromWorkspace(mailbox)) {
    return mailboxOAuthRedirectToClient(clientId, {
      mailbox_oauth: "error",
      reason: "mailbox_removed",
      oauth_mailbox_id: mailbox.id,
    });
  }

  if (err) {
    const desc = url.searchParams.get("error_description") ?? err;
    await prisma.$transaction(async (tx) => {
      await tx.clientMailboxIdentity.update({
        where: { id: mailbox.id },
        data: {
          connectionStatus: "CONNECTION_ERROR",
          lastError: `Google OAuth: ${desc}`.slice(0, 4000),
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
        provider: "GOOGLE",
        outcome: "provider_error",
        error: err,
      },
    });
    return mailboxOAuthRedirectToClient(clientId, {
      mailbox_oauth: "error",
      reason: "provider_denied",
      oauth_mailbox_id: mailbox.id,
    });
  }

  if (!code) {
    return mailboxOAuthRedirectToClient(clientId, {
      mailbox_oauth: "error",
      reason: "missing_code",
      oauth_mailbox_id: mailbox.id,
    });
  }

  const callbackStaff = await tryGetOpensDoorsStaff();
  const staffId = callbackStaff?.id ?? null;

  try {
    const tokens = await exchangeGoogleMailboxAuthCode(code);
    if (!tokens.refresh_token) {
      throw new Error(
        "Google did not return a refresh token — try again and accept offline access (prompt=consent).",
      );
    }
    const profile = await fetchGoogleUserEmailAndSub(tokens.access_token);
    await verifyGoogleMailboxOAuthForWorkspaceRow({
      accessToken: tokens.access_token,
      mailboxEmailNormalized: mailbox.emailNormalized,
      oauthUserEmail: profile.email,
    });

    const now = Date.now();
    const expiresAt =
      typeof tokens.expires_in === "number"
        ? now + tokens.expires_in * 1000
        : null;

    const encrypted = encryptMailboxCredentialJson({
      v: 1,
      provider: "GOOGLE",
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
          provider: "GOOGLE",
          encryptedCredential: encrypted,
        },
        update: {
          provider: "GOOGLE",
          encryptedCredential: encrypted,
        },
      });
      await tx.clientMailboxIdentity.update({
        where: { id: mailbox.id },
        data: {
          connectionStatus: "CONNECTED",
          oauthState: null,
          oauthStateExpiresAt: null,
          providerLinkedUserId: profile.sub,
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
        provider: "GOOGLE",
        outcome: "connected",
        providerLinkedUserId: profile.sub,
      },
    });

    return mailboxOAuthRedirectToClient(clientId, {
      mailbox_oauth: "connected",
      oauth_mailbox_id: mailbox.id,
    });
  } catch (e) {
    // Approving as the wrong Google account is not a generic failure: the guard
    // refused on purpose and the operator can fix it themselves. It gets its own
    // reason code and carries the approving address, so the page can name both
    // it and the row. Everything else stays `callback_failed`.
    const mismatch =
      e instanceof MailboxOAuthAccountMismatchError ? e : null;
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
        provider: "GOOGLE",
        outcome: mismatch ? "account_mismatch" : "failed",
        ...(mismatch ? { oauthActorEmail: mismatch.approvedEmail } : {}),
      },
    });
    return mailboxOAuthRedirectToClient(clientId, {
      mailbox_oauth: "error",
      reason: mismatch
        ? MAILBOX_OAUTH_ACCOUNT_MISMATCH_REASON
        : "callback_failed",
      oauth_mailbox_id: mailbox.id,
      ...(mismatch ? { oauth_actor: mismatch.approvedEmail } : {}),
    });
  }
}
