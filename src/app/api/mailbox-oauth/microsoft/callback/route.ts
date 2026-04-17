import { prisma } from "@/lib/db";
import { normalizeEmail } from "@/lib/normalize";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import {
  exchangeMicrosoftMailboxAuthCode,
  fetchMicrosoftGraphPrimaryEmail,
} from "@/server/mailbox/microsoft-mailbox-oauth";
import { auditMailboxConnectionChange } from "@/server/mailbox/mailbox-connection-audit";
import {
  mailboxEmailsAlign,
  mailboxOAuthRedirectToClient,
} from "@/server/mailbox/mailbox-oauth-callback-shared";
import { encryptMailboxCredentialJson } from "@/server/mailbox/oauth-crypto";

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

  if (err) {
    const desc = url.searchParams.get("error_description") ?? err;
    await prisma.clientMailboxIdentity.update({
      where: { id: mailbox.id },
      data: {
        connectionStatus: "CONNECTION_ERROR",
        lastError: `Microsoft OAuth: ${desc}`.slice(0, 4000),
        oauthState: null,
        oauthStateExpiresAt: null,
      },
    });
    let staffId: string | null = null;
    try {
      const staff = await requireOpensDoorsStaff();
      staffId = staff.id;
    } catch {
      /* still redirect */
    }
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

  let staffId: string | null = null;
  try {
    const staff = await requireOpensDoorsStaff();
    staffId = staff.id;
  } catch {
    await prisma.clientMailboxIdentity.update({
      where: { id: mailbox.id },
      data: {
        connectionStatus: "CONNECTION_ERROR",
        lastError:
          "Sign in to OpensDoors in this browser, then retry mailbox connection from the client page.",
        oauthState: null,
        oauthStateExpiresAt: null,
      },
    });
    return mailboxOAuthRedirectToClient(clientId, {
      mailbox_oauth: "error",
      reason: "staff_session",
    });
  }

  try {
    const tokens = await exchangeMicrosoftMailboxAuthCode(code);
    if (!tokens.refresh_token) {
      throw new Error(
        "Microsoft did not return a refresh token — ensure offline_access scope and consent.",
      );
    }
    const me = await fetchMicrosoftGraphPrimaryEmail(tokens.access_token);
    if (!mailboxEmailsAlign(mailbox.emailNormalized, me.primaryEmail)) {
      throw new Error(
        `Signed-in Microsoft account (${normalizeEmail(me.primaryEmail)}) does not match this mailbox (${mailbox.emailNormalized}).`,
      );
    }

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
          providerLinkedUserId: me.id,
          connectedAt: new Date(),
          lastError: null,
        },
      });
    });

    await auditMailboxConnectionChange({
      staffUserId: staffId,
      clientId,
      mailboxId: mailbox.id,
      metadata: {
        kind: "mailbox_oauth_callback",
        provider: "MICROSOFT",
        outcome: "connected",
        providerLinkedUserId: me.id,
      },
    });

    return mailboxOAuthRedirectToClient(clientId, { mailbox_oauth: "connected" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "OAuth failed";
    await prisma.clientMailboxIdentity.update({
      where: { id: mailbox.id },
      data: {
        connectionStatus: "CONNECTION_ERROR",
        lastError: msg.slice(0, 4000),
        oauthState: null,
        oauthStateExpiresAt: null,
      },
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
