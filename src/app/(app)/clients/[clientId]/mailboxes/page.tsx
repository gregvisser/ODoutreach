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
          Connected sender accounts, capacity, and identity readiness for this workspace.
        </p>
      </div>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>Outbound sender identity</CardTitle>
          <CardDescription>
            Configured vs verified vs allowlisted — operational envelope for this client.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SenderReadinessPanel report={bundle.senderReport} />
        </CardContent>
      </Card>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>Mailbox identities</CardTitle>
          <CardDescription>
            Connect up to <strong>five</strong> outreach senders (cap {String(OUTREACH_MAILBOX_DAILY_CAP)}
            /day each, {String(THEORETICAL_MAX_CLIENT_DAILY_SENDS)}/day pooled). OAuth tokens stay on the
            server. Microsoft Graph <strong>Mail.Read</strong> / <strong>Mail.Send</strong> and Gmail{" "}
            <strong>readonly</strong> / <strong>send</strong> scopes; reconnect after scope changes.
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
