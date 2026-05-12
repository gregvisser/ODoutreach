import { notFound } from "next/navigation";

import { ClientMailboxIdentitiesPanel } from "@/components/clients/client-mailbox-identities-panel";
import { InternalProofSendCard } from "@/components/clients/internal-proof-send-card";
import { Card, CardContent } from "@/components/ui/card";
import { MAILBOXES_PAGE_INTRO } from "@/lib/mailboxes/mailbox-workspace-model";
import { canAccessMailboxSetupTools } from "@/lib/mailboxes/mailbox-setup-access";
import { prisma } from "@/lib/db";
import { resolvePublicBaseUrl } from "@/lib/unsubscribe/one-click-readiness";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { loadClientWorkspaceBundle } from "@/server/queries/client-workspace-bundle";
import { getAccessibleClientIds } from "@/server/tenant/access";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ clientId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ClientMailboxesPage({ params, searchParams }: Props) {
  const staff = await requireOpensDoorsStaff();
  const accessible = await getAccessibleClientIds(staff);
  const { clientId } = await params;
  const sp = searchParams ? await searchParams : {};
  const mailboxOAuthResult =
    typeof sp.mailbox_oauth === "string"
      ? sp.mailbox_oauth
      : Array.isArray(sp.mailbox_oauth)
        ? sp.mailbox_oauth[0]
        : undefined;
  const mailboxOAuthReason =
    typeof sp.reason === "string" ? sp.reason : Array.isArray(sp.reason) ? sp.reason[0] : undefined;
  const oauthMailboxIdRaw =
    typeof sp.oauth_mailbox_id === "string"
      ? sp.oauth_mailbox_id
      : Array.isArray(sp.oauth_mailbox_id)
        ? sp.oauth_mailbox_id[0]
        : undefined;

  const bundle = await loadClientWorkspaceBundle(clientId, accessible, staff);
  if (!bundle.client) notFound();
  const client = bundle.client;
  const showMailboxSetupTools = canAccessMailboxSetupTools(staff.role);
  const publicSiteOrigin = resolvePublicBaseUrl();

  /** Read-model overlays must not decide OAuth success — check persisted mailbox row. */
  let oauthMailboxVerifiedConnected = false;
  if (
    oauthMailboxIdRaw &&
    mailboxOAuthResult === "connected"
  ) {
    const persisted = await prisma.clientMailboxIdentity.findFirst({
      where: { id: oauthMailboxIdRaw, clientId },
      select: { connectionStatus: true },
    });
    oauthMailboxVerifiedConnected = persisted?.connectionStatus === "CONNECTED";
  }

  const mailboxOAuthErrorMessage = (() => {
    if (mailboxOAuthResult !== "error") return null;
    switch (mailboxOAuthReason) {
      case "oauth_state_invalid":
        return "Mailbox sign-in link expired or was skipped. Click Connect again.";
      case "oauth_not_configured":
        return "Microsoft mailbox OAuth is not configured for this deployment. Ask an administrator.";
      case "missing_params":
        return "Could not start Microsoft sign-in (missing parameters). Try Connect again.";
      case "invalid_mailbox":
        return "That mailbox row is invalid or does not belong to this workspace.";
      case "mailbox_removed":
        return "That mailbox was removed from this workspace. Restore it first.";
      case "provider_denied":
        return "Microsoft sign-in was cancelled or denied in the provider window.";
      case "callback_failed":
        return "Microsoft sign-in did not finish. Check the mailbox row for details and try Connect again.";
      default:
        return "Mailbox sign-in did not complete. Open the row below and try Connect again, or sign in from a browser where you can reach Microsoft or Google.";
    }
  })();

  const mailboxOAuthSuccessBanner = (() => {
    if (mailboxOAuthResult !== "connected") return null;
    if (oauthMailboxIdRaw && !oauthMailboxVerifiedConnected) {
      return {
        type: "err" as const,
        text: "Microsoft returned, but this mailbox is still not connected. Check the row below or click Connect again.",
      };
    }
    return {
      type: "ok" as const,
      text: "Mailbox connected. Connection status was updated.",
    };
  })();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Mailboxes</h1>
        <p className="text-sm text-muted-foreground sm:text-base">{client.name}</p>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          {MAILBOXES_PAGE_INTRO}
        </p>
        {!showMailboxSetupTools ? (
          <p className="mt-3 max-w-3xl rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
            Connected senders and today’s remaining send capacity. Signature setup and proof sends are
            admin-only — ask a manager if you need changes.
          </p>
        ) : null}
      </div>

      {showMailboxSetupTools ? (
        <InternalProofSendCard
          clientId={client.id}
          rows={bundle.mailboxRows}
          sendingReadinessByMailboxId={bundle.sendingReadinessByMailboxId}
          canMutate={bundle.canMutateMailboxes}
          oauthMicrosoftConfigured={bundle.oauthMicrosoftReady}
          oauthGoogleConfigured={bundle.oauthGoogleReady}
        />
      ) : null}

      <Card className="border-border/80 shadow-sm">
        <CardContent className="pt-6">
          <ClientMailboxIdentitiesPanel
            clientId={client.id}
            rows={bundle.mailboxRows}
            canMutate={bundle.canMutateMailboxes}
            oauthMicrosoftConfigured={bundle.oauthMicrosoftReady}
            oauthGoogleConfigured={bundle.oauthGoogleReady}
            sendingReadinessByMailboxId={bundle.sendingReadinessByMailboxId}
            senderReport={bundle.senderReport}
            aggregateRemaining={bundle.aggregateRemaining}
            showMailboxSetupTools={showMailboxSetupTools}
            workspaceDisplayName={client.name}
            publicSiteOrigin={publicSiteOrigin}
            clientBriefFallback={{
              senderDisplayNameFallback: client.name,
              emailSignatureFallback:
                typeof bundle.brief.emailSignature === "string" &&
                bundle.brief.emailSignature.trim().length > 0
                  ? bundle.brief.emailSignature
                  : null,
            }}
            mailboxOAuthBanner={
              mailboxOAuthSuccessBanner ??
              (mailboxOAuthResult === "error"
                ? {
                    type: "err" as const,
                    text: mailboxOAuthErrorMessage ?? "Mailbox sign-in failed.",
                  }
                : null)
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
