import { notFound } from "next/navigation";

import { ClientMailboxIdentitiesPanel } from "@/components/clients/client-mailbox-identities-panel";
import { Card, CardContent } from "@/components/ui/card";
import { MAILBOXES_PAGE_INTRO } from "@/lib/mailboxes/mailbox-workspace-model";
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

  const bundle = await loadClientWorkspaceBundle(clientId, accessible, staff);
  if (!bundle.client) notFound();
  const client = bundle.client;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Mailboxes</h1>
        <p className="text-sm text-muted-foreground sm:text-base">{client.name}</p>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          {MAILBOXES_PAGE_INTRO}
        </p>
      </div>

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
            clientBriefFallback={{
              senderDisplayNameFallback: client.name,
              emailSignatureFallback:
                typeof bundle.brief.emailSignature === "string" &&
                bundle.brief.emailSignature.trim().length > 0
                  ? bundle.brief.emailSignature
                  : null,
            }}
            mailboxOAuthBanner={
              mailboxOAuthResult === "connected"
                ? {
                    type: "ok" as const,
                    text: "Mailbox connected. Connection status was updated.",
                  }
                : mailboxOAuthResult === "error"
                  ? {
                      type: "err" as const,
                      text:
                        mailboxOAuthReason === "staff_session"
                          ? "Sign in to OpensDoors, then connect the mailbox again."
                          : mailboxOAuthReason === "mailbox_removed"
                            ? "That mailbox is removed from this workspace. Restore it first, then connect again."
                            : "Mailbox sign-in did not complete. Open the row below and try again.",
                    }
                  : null
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
