import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ClientMailboxInboxPanel } from "@/components/clients/client-mailbox-inbox-panel";
import { GovernedTestSendPanel } from "@/components/clients/governed-test-send-panel";
import { ClientMailboxIdentitiesPanel } from "@/components/clients/client-mailbox-identities-panel";
import { RecentGovernedSendsPanel } from "@/components/clients/recent-governed-sends-panel";
import { SenderReadinessPanel } from "@/components/ops/sender-readiness-panel";
import { describeSenderReadiness } from "@/lib/sender-readiness";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { getClientMailboxMutationAllowed } from "@/server/mailbox-identities/mutator-access";
import {
  isGoogleMailboxOAuthConfigured,
  isMicrosoftMailboxOAuthConfigured,
} from "@/server/mailbox/oauth-env";
import { loadGovernedSendingMailbox } from "@/server/mailbox/sending-policy";
import { getClientByIdForStaff } from "@/server/queries/clients";
import { getRecentInboundMailboxMessagesForClient } from "@/server/queries/mailbox-inbox";
import { getMailboxSendingReadinessForClient } from "@/server/queries/mailbox-sending-readiness";
import { getRecentGovernedSendsForClient } from "@/server/queries/governed-send-ledger";
import { getAccessibleClientIds } from "@/server/tenant/access";
import { utcDateKeyForInstant } from "@/lib/sending-window";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ clientId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ClientDetailPage({ params, searchParams }: Props) {
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

  const client = await getClientByIdForStaff(clientId, accessible);
  if (!client) notFound();
  const graphInbox = await getRecentInboundMailboxMessagesForClient(clientId, 50);
  const sendingReadiness = await getMailboxSendingReadinessForClient(
    clientId,
    client.mailboxIdentities,
  );
  const recentGovernedSends = await getRecentGovernedSendsForClient(clientId, 25);
  const oauthMicrosoftReady = isMicrosoftMailboxOAuthConfigured();
  const oauthGoogleReady = isGoogleMailboxOAuthConfigured();
  const governedMailbox = await loadGovernedSendingMailbox(clientId);
  const hasGovernedMailbox = governedMailbox.mode === "governed";
  const oauthReadyForGovernedTest =
    governedMailbox.mode === "governed"
      ? governedMailbox.mailbox.provider === "GOOGLE"
        ? oauthGoogleReady
        : oauthMicrosoftReady
      : false;
  const currentUtcWindowKey = utcDateKeyForInstant(new Date());
  const sendingReadinessByMailboxId = Object.fromEntries(
    sendingReadiness.map((s) => [s.mailboxId, s]),
  );

  const canMutateMailboxes = await getClientMailboxMutationAllowed(staff, client.id);
  const mailboxRows = client.mailboxIdentities.map((m) => ({
    id: m.id,
    email: m.email,
    displayName: m.displayName,
    provider: m.provider,
    connectionStatus: m.connectionStatus,
    providerLinkedUserId: m.providerLinkedUserId,
    connectedAt: m.connectedAt?.toISOString() ?? null,
    isActive: m.isActive,
    isPrimary: m.isPrimary,
    canSend: m.canSend,
    canReceive: m.canReceive,
    dailySendCap: m.dailySendCap,
    isSendingEnabled: m.isSendingEnabled,
    emailsSentToday: m.emailsSentToday,
    dailyWindowResetAt: m.dailyWindowResetAt?.toISOString() ?? null,
    lastSyncAt: m.lastSyncAt?.toISOString() ?? null,
    lastError: m.lastError,
    updatedAt: m.updatedAt.toISOString(),
  }));

  const graphInboxRows = graphInbox.map((m) => ({
    id: m.id,
    fromEmail: m.fromEmail,
    toEmail: m.toEmail,
    subject: m.subject,
    bodyPreview: m.bodyPreview,
    receivedAt: m.receivedAt.toISOString(),
    conversationId: m.conversationId,
    mailbox: m.mailbox,
  }));

  const connectedMailboxInbox = client.mailboxIdentities
    .filter(
      (m) =>
        (m.provider === "MICROSOFT" || m.provider === "GOOGLE") &&
        m.connectionStatus === "CONNECTED",
    )
    .map((m) => ({
      id: m.id,
      email: m.email,
      label: m.displayName?.trim() ? m.displayName : m.email,
      provider: m.provider,
    }));

  const senderReport = describeSenderReadiness({
    defaultSenderEmail: client.defaultSenderEmail,
    senderIdentityStatus: client.senderIdentityStatus,
  });

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Client workspace
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">{client.name}</h1>
          <p className="mt-1 text-muted-foreground">
            Slug <span className="font-mono text-foreground">{client.slug}</span> ·{" "}
            <Badge variant="outline">{client.status}</Badge>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/contacts?client=${client.id}`}
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            Contacts
          </Link>
          <Link
            href={`/suppression?client=${client.id}`}
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            Suppression
          </Link>
          <Link
            href={`/activity?client=${client.id}`}
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            Activity
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription>Contacts</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {client._count.contacts}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription>Suppressed emails</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {client._count.suppressedEmails}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription>Campaigns</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {client._count.campaigns}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>Outbound sender identity</CardTitle>
          <CardDescription>
            Configured vs verified vs allowlisted — operational sending only (not CRM).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SenderReadinessPanel report={senderReport} />
        </CardContent>
      </Card>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>Mailbox identities</CardTitle>
          <CardDescription>
            Connect each mailbox to Microsoft 365 or Google Workspace with OAuth (tokens stay on the
            server). Up to five active identities; governed outbound uses a per-mailbox UTC-day
            reservation ledger (30/day default).             Microsoft Graph <strong>Mail.Read</strong> / <strong>Mail.Send</strong> and Gmail{" "}
            <strong>readonly</strong> / <strong>send</strong> scopes are requested; adding scopes
            requires a mailbox reconnect for consent. Inbox preview (below) uses the same connection.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ClientMailboxIdentitiesPanel
            clientId={client.id}
            rows={mailboxRows}
            canMutate={canMutateMailboxes}
            oauthMicrosoftConfigured={oauthMicrosoftReady}
            oauthGoogleConfigured={oauthGoogleReady}
            sendingReadinessByMailboxId={sendingReadinessByMailboxId}
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

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>Recent governed sends</CardTitle>
          <CardDescription>
            Read-only ledger for governed test emails (same UTC-day reservation as the mailbox
            table). Use this to reconcile “booked” counts with actual rows — no database access
            required.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RecentGovernedSendsPanel
            rows={recentGovernedSends}
            currentUtcWindowKey={currentUtcWindowKey}
          />
        </CardContent>
      </Card>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>Governed test send (operator)</CardTitle>
          <CardDescription>
            Queue exactly one internal proof email through the reservation ledger and the connected
            mailbox provider (Microsoft Graph or Gmail API) — no campaign engine, no bulk, no AI. Use
            only for controlled verification.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GovernedTestSendPanel
            clientId={client.id}
            canMutate={canMutateMailboxes}
            hasGovernedMailbox={hasGovernedMailbox}
            oauthReadyForGovernedTest={oauthReadyForGovernedTest}
          />
        </CardContent>
      </Card>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>Mailbox inbox (preview)</CardTitle>
          <CardDescription>
            Recent messages from connected Microsoft 365 or Google Workspace mailboxes (Graph or Gmail
            API). Same client scope as other workspace data.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ClientMailboxInboxPanel
            clientId={client.id}
            messages={graphInboxRows}
            connectedMailboxes={connectedMailboxInbox}
            canSync={canMutateMailboxes}
            oauthMicrosoftReady={oauthMicrosoftReady}
            oauthGoogleReady={oauthGoogleReady}
          />
        </CardContent>
      </Card>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>Onboarding snapshot</CardTitle>
          <CardDescription>Captured during workspace creation</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {client.onboarding ? (
            <pre className="overflow-x-auto rounded-lg bg-muted/50 p-4 text-xs text-foreground">
              {JSON.stringify(client.onboarding.formData, null, 2)}
            </pre>
          ) : (
            <p>No onboarding record.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
