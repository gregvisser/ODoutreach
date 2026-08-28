import { isMailboxRemovedFromWorkspace } from "@/lib/mailbox-workspace-removal";
import { prisma } from "@/lib/db";
import { tryGetOpensDoorsStaff } from "@/server/auth/staff";
import { exchangeMicrosoftMailboxAuthCode } from "@/server/mailbox/microsoft-mailbox-oauth";
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
import { resolveMicrosoftMailboxOAuthConnection } from "@/server/mailbox/mailbox-oauth-microsoft-resolve";
import { encryptMailboxCredentialJson } from "@/server/mailbox/oauth-crypto";
import { reconcilePrimaryMailboxForClient } from "@/server/mailbox/mailbox-primary-consistency";

/** Minimal branded standalone page shown to a customer's IT admin after they
 *  grant (or decline) tenant-wide admin consent. Non-technical, no app chrome. */
function adminConsentResultPage(ok: boolean, detail?: string): Response {
  const title = ok
    ? "OpensDoors is approved ✅"
    : "Approval was not completed";
  const body = ok
    ? "Your organisation's administrator has approved OpensDoors. You can close this window. The mailbox owner can now connect their mailbox in OpensDoors — no more admin approval prompt."
    : `The approval did not go through${detail ? `: ${detail}` : "."} You can close this window and try the link again, or contact OpensDoors for help.`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f5f5f7;color:#1d1d1f;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px}
  .card{background:#fff;max-width:460px;border:1px solid #e5e5ea;border-radius:14px;padding:28px 26px;box-shadow:0 1px 3px rgba(0,0,0,.06)}
  h1{font-size:20px;margin:0 0 12px}
  p{font-size:15px;line-height:1.55;color:#3a3a3c;margin:0}
</style></head><body><div class="card"><h1>${title}</h1><p>${body}</p></div></body></html>`;
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const err = url.searchParams.get("error");
  const state = url.searchParams.get("state")?.trim();
  const code = url.searchParams.get("code")?.trim();

  // Tenant-wide admin consent (separate from a mailbox connect) redirects here
  // with `admin_consent` and no `code`/mailbox `state`. Show the customer's IT
  // admin a friendly confirmation rather than the connect-flow error path.
  if (url.searchParams.get("admin_consent") !== null) {
    if (err) {
      const desc = url.searchParams.get("error_description") ?? err;
      return adminConsentResultPage(false, desc);
    }
    return adminConsentResultPage(true);
  }

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

  // Every error redirect from here down carries the mailbox id, so the page can
  // read the row's real provider instead of assuming one.

  // See the Google callback: the prepare step's 15-minute expiry, enforced. It
  // goes first, before anything else reasons about the row, and it writes nothing.
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
    // See the Google callback: a wrong-account approval is a refusal the
    // operator can act on, not a shrug, and it is reported as its own thing.
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
        provider: "MICROSOFT",
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
