import { NextResponse } from "next/server";

import { getAppBaseUrl } from "@/lib/mailbox-oauth-app-url";
import { prisma } from "@/lib/db";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { buildMicrosoftMailboxAuthorizeUrl } from "@/server/mailbox/microsoft-mailbox-oauth";
import { requireClientMailboxMutator } from "@/server/mailbox-identities/mutator-access";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const clientId = url.searchParams.get("clientId")?.trim();
  const mailboxId = url.searchParams.get("mailboxId")?.trim();
  const base = getAppBaseUrl();

  const fail = (reason: string) =>
    NextResponse.redirect(
      new URL(
        `/clients/${clientId ?? ""}?mailbox_oauth=error&reason=${encodeURIComponent(reason)}`,
        base,
      ),
    );

  if (!clientId || !mailboxId) {
    return fail("missing_params");
  }

  try {
    const staff = await requireOpensDoorsStaff();
    await requireClientMailboxMutator(staff, clientId);
  } catch {
    return NextResponse.redirect(
      new URL(
        `/sign-in?callbackUrl=${encodeURIComponent(req.url)}`,
        base,
      ),
    );
  }

  const mailbox = await prisma.clientMailboxIdentity.findFirst({
    where: { id: mailboxId, clientId },
  });
  if (!mailbox || mailbox.provider !== "MICROSOFT") {
    return fail("invalid_mailbox");
  }

  const now = Date.now();
  if (
    !mailbox.oauthState ||
    !mailbox.oauthStateExpiresAt ||
    mailbox.oauthStateExpiresAt.getTime() <= now
  ) {
    await prisma.clientMailboxIdentity.updateMany({
      where: { id: mailboxId, clientId },
      data: {
        connectionStatus: "CONNECTION_ERROR",
        lastError:
          "OAuth session expired or missing — click Connect again from the client page.",
        oauthState: null,
        oauthStateExpiresAt: null,
      },
    });
    return fail("oauth_state_invalid");
  }

  try {
    const authorizeUrl = buildMicrosoftMailboxAuthorizeUrl(mailbox.oauthState);
    return NextResponse.redirect(authorizeUrl);
  } catch {
    return fail("oauth_not_configured");
  }
}
