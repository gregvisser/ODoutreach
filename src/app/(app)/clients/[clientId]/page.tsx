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
import { ClientSuppressionInlineCard } from "@/components/clients/client-suppression-inline-card";
import { ControlledPilotSendPanel } from "@/components/clients/controlled-pilot-send-panel";
import { GovernedTestSendPanel } from "@/components/clients/governed-test-send-panel";
import { ClientMailboxIdentitiesPanel } from "@/components/clients/client-mailbox-identities-panel";
import { OpensDoorsBriefPanel } from "@/components/clients/opensdoors-brief-panel";
import { RecentGovernedSendsPanel } from "@/components/clients/recent-governed-sends-panel";
import { RocketReachImportPanel } from "@/components/clients/rocketreach-import-panel";
import { TonightLaunchChecklist } from "@/components/clients/tonight-launch-checklist";
import { SenderReadinessPanel } from "@/components/ops/sender-readiness-panel";
import { CONTROLLED_PILOT_HARD_MAX_RECIPIENTS } from "@/lib/controlled-pilot-constants";
import { briefLooksFilled, parseOpensDoorsBrief } from "@/lib/opensdoors-brief";
import { describeSenderReadiness } from "@/lib/sender-readiness";
import { utcDateKeyForInstant } from "@/lib/sending-window";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { hasGoogleServiceAccountConfig } from "@/server/integrations/google-sheets/auth";
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
import { getPilotContactSummaryForClient } from "@/server/queries/pilot-contact-summary";
import { getAccessibleClientIds } from "@/server/tenant/access";

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
  const pilotContactSummary = await getPilotContactSummaryForClient(clientId);
  const oauthMicrosoftReady = isMicrosoftMailboxOAuthConfigured();
  const oauthGoogleReady = isGoogleMailboxOAuthConfigured();
  const googleSheetsEnvReady = hasGoogleServiceAccountConfig();
  const rocketReachEnvReady = !!process.env.ROCKETREACH_API_KEY?.trim();
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

  const brief = parseOpensDoorsBrief(client.onboarding?.formData);
  const hasBrief = briefLooksFilled(brief);
  const suppressionSheetRows = client.suppressionSources.filter((s) => !!s.spreadsheetId?.trim());

  const governedReadiness =
    governedMailbox.mode === "governed"
      ? sendingReadiness.find((s) => s.mailboxId === governedMailbox.mailbox.id)
      : undefined;

  const pilotPrerequisites = {
    clientActive: client.status === "ACTIVE",
    contactCount: client._count.contacts,
    hasGovernedMailbox,
    oauthReady: oauthReadyForGovernedTest,
    governedMailboxEmail:
      governedMailbox.mode === "governed" ? governedMailbox.mailbox.email : null,
    cap: governedReadiness?.cap ?? 30,
    bookedInUtcDay: governedReadiness?.bookedInUtcDay ?? 0,
    remaining: governedReadiness?.remaining ?? 0,
    eligible: governedReadiness?.eligible ?? false,
    ineligibleReason: governedReadiness?.ineligibleCode
      ? governedReadiness.ineligibleCode.replace(/_/g, " ")
      : null,
  };

  const checklistItems = [
    { label: "Staff access / app login", ok: true, detail: "OpensDoors staff session" },
    { label: "Client workspace", ok: client.status === "ACTIVE", detail: client.status },
    {
      label: "OpensDoors operating brief",
      ok: hasBrief,
      detail: hasBrief ? "Brief fields present" : "Fill the brief card below",
    },
    {
      label: "Suppression sheet ids",
      ok: suppressionSheetRows.length > 0,
      detail:
        suppressionSheetRows.length > 0
          ? `${String(suppressionSheetRows.length)} source(s) with spreadsheet id`
          : "Paste Sheet URLs on the suppression card",
    },
    {
      label: "Google Sheets API (service account)",
      ok: googleSheetsEnvReady,
      detail: googleSheetsEnvReady ? "Env present" : "Set GOOGLE_SERVICE_ACCOUNT_JSON*",
    },
    {
      label: "RocketReach API key (import)",
      ok: rocketReachEnvReady,
      detail: rocketReachEnvReady ? "ROCKETREACH_API_KEY present" : "Optional until import",
    },
    {
      label: "Contacts / lead rows",
      ok: client._count.contacts > 0,
      detail: `${String(client._count.contacts)} contact(s)`,
    },
    {
      label: "Microsoft mailbox path",
      ok: client.mailboxIdentities.some((m) => m.provider === "MICROSOFT" && m.connectionStatus === "CONNECTED"),
      detail: "At least one connected Microsoft identity",
    },
    {
      label: "Google Workspace mailbox path",
      ok: client.mailboxIdentities.some((m) => m.provider === "GOOGLE" && m.connectionStatus === "CONNECTED"),
      detail: "At least one connected Google identity",
    },
    {
      label: "Governed sender + OAuth env",
      ok: hasGovernedMailbox && oauthReadyForGovernedTest,
      detail: hasGovernedMailbox ? "Mailbox + provider OAuth" : "Connect a mailbox",
    },
    {
      label: "Inbound fetch",
      ok: client.mailboxIdentities.some((m) => m.connectionStatus === "CONNECTED" && (m.provider === "MICROSOFT" || m.provider === "GOOGLE")),
      detail: "Use mailbox inbox preview below",
    },
    {
      label: "Ledger / readiness",
      ok: !!(governedReadiness && !governedReadiness.atLedgerCap && governedReadiness.eligible),
      detail: governedReadiness ? `${governedReadiness.remaining} sends left (UTC day)` : "—",
    },
    {
      label: "Controlled pilot send",
      ok: hasGovernedMailbox && oauthReadyForGovernedTest && (governedReadiness?.eligible ?? false),
      detail: "Small batch card below",
    },
  ];

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

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>Tonight launch checklist</CardTitle>
          <CardDescription>
            Pilot-safe MVP — confirm each line before a live send. Not a full campaign automation suite.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TonightLaunchChecklist items={checklistItems} />
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription>Contacts</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{client._count.contacts}</CardTitle>
            <p className="text-xs text-muted-foreground">
              Eligible {pilotContactSummary.eligibleCount} · suppressed{" "}
              {pilotContactSummary.suppressedCount}
            </p>
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
            Read-only ledger for governed test and controlled pilot sends (same UTC-day reservation
            as the mailbox table). Use this to reconcile “booked” counts with actual rows — no
            database access required.
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
          <CardTitle>OpensDoors operating brief</CardTitle>
          <CardDescription>
            Client-specific onboarding and messaging context — stored in{" "}
            <code className="text-xs">ClientOnboarding.formData</code> (no migration). Used as defaults
            for the controlled pilot card when templates are set.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OpensDoorsBriefPanel clientId={client.id} initial={brief} />
        </CardContent>
      </Card>

      <ClientSuppressionInlineCard
        clientId={client.id}
        clientName={client.name}
        googleServiceAccountConfigured={googleSheetsEnvReady}
        sources={client.suppressionSources.map((s) => ({
          id: s.id,
          kind: s.kind,
          spreadsheetId: s.spreadsheetId,
          sheetRange: s.sheetRange,
          syncStatus: s.syncStatus,
          lastSyncedAt: s.lastSyncedAt?.toISOString() ?? null,
          lastError: s.lastError,
        }))}
      />

      <RocketReachImportPanel clientId={client.id} apiKeyConfigured={rocketReachEnvReady} />

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>Controlled pilot send</CardTitle>
          <CardDescription>
            Queue a tiny batch (max {CONTROLLED_PILOT_HARD_MAX_RECIPIENTS} recipients per run) through the same governed mailbox and{" "}
            <code className="text-xs">MailboxSendReservation</code> ledger as contact sends. Type{" "}
            <span className="font-mono text-xs">SEND PILOT</span> to confirm. Internal /
            allowlisted domains only unless you extend recipient policy.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ControlledPilotSendPanel
            key={`pilot-${client.id}-${brief.pilotSubjectTemplate ?? ""}-${brief.pilotBodyTemplate ?? ""}`}
            clientId={client.id}
            canMutate={canMutateMailboxes}
            prerequisites={pilotPrerequisites}
            initialSubject={brief.pilotSubjectTemplate}
            initialBody={brief.pilotBodyTemplate}
            contactSummary={pilotContactSummary}
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

    </div>
  );
}
