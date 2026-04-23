import { notFound } from "next/navigation";

import { ClientMailboxIdentitiesPanel } from "@/components/clients/client-mailbox-identities-panel";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SenderReadinessPanel } from "@/components/ops/sender-readiness-panel";
import {
  THEORETICAL_MAX_CLIENT_DAILY_SENDS,
  OUTREACH_MAILBOX_DAILY_CAP,
} from "@/lib/outreach-mailbox-model";
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
    <div className="space-y-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Mailboxes
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">{client.name}</h1>
        <p className="mt-1 text-muted-foreground">
          Shared workspace mailboxes for this client — connected sender
          accounts, daily capacity, and sender identity. Any authorised
          operator on this client can send from and reply through any
          connected mailbox here.
        </p>
      </div>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>Sender identity</CardTitle>
          <CardDescription>
            Where outbound email is sent from and whether that sender is ready
            to go live.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SenderReadinessPanel report={bundle.senderReport} />
        </CardContent>
      </Card>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>Connected mailboxes</CardTitle>
          <CardDescription>
            Connect up to <strong>five</strong> sending mailboxes. Each mailbox
            sends up to {String(OUTREACH_MAILBOX_DAILY_CAP)} messages per day,
            for a total of {String(THEORETICAL_MAX_CLIENT_DAILY_SENDS)} per day
            across the pool. Sign-in is via Microsoft 365 or Google Workspace
            and happens on their side — credentials are never stored here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ClientMailboxIdentitiesPanel
            clientId={client.id}
            rows={bundle.mailboxRows}
            canMutate={bundle.canMutateMailboxes}
            oauthMicrosoftConfigured={bundle.oauthMicrosoftReady}
            oauthGoogleConfigured={bundle.oauthGoogleReady}
            sendingReadinessByMailboxId={bundle.sendingReadinessByMailboxId}
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
                ? { type: "ok" as const, text: "Mailbox OAuth completed — connection status updated." }
                : mailboxOAuthResult === "error"
                  ? {
                      type: "err" as const,
                      text:
                        mailboxOAuthReason === "staff_session"
                          ? "Sign in to OpensDoors, then run mailbox connection again."
                          : "Mailbox OAuth did not complete. Check the last error on the row or retry connection.",
                    }
                  : null
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
