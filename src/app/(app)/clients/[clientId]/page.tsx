import { notFound } from "next/navigation";

import { ClientOverviewSummaryGrid } from "@/components/clients/client-overview-summary-grid";
import { ClientWorkspaceCommandCenter } from "@/components/clients/client-workspace-command-center";
import { LaunchReadinessPanel } from "@/components/clients/launch-readiness-panel";
import { TonightLaunchChecklist } from "@/components/clients/tonight-launch-checklist";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  buildClientWorkflowSteps,
  buildLaunchReadinessRows,
  deriveLaunchStageLabel,
} from "@/lib/client-launch-state";
import {
  formatOutreachMailboxCapacityChecklistDetail,
  REQUIRED_OUTREACH_MAILBOX_COUNT,
  THEORETICAL_MAX_CLIENT_DAILY_SENDS,
  OUTREACH_MAILBOX_DAILY_CAP,
} from "@/lib/outreach-mailbox-model";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { loadClientWorkspaceBundle } from "@/server/queries/client-workspace-bundle";
import { getAccessibleClientIds } from "@/server/tenant/access";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ clientId: string }>;
};

export default async function ClientDetailPage({ params }: Props) {
  const staff = await requireOpensDoorsStaff();
  const accessible = await getAccessibleClientIds(staff);
  const { clientId } = await params;

  const bundle = await loadClientWorkspaceBundle(clientId, accessible, staff);
  if (!bundle.client) notFound();

  const client = bundle.client;
  const briefChecklistReady = bundle.onboardingCompletion.status === "ready";

  const outreachPilotRunnable =
    bundle.hasGovernedMailbox &&
    bundle.oauthReadyForGovernedTest &&
    bundle.poolCanSendPilot;

  const suppressionLatestSyncAt = (() => {
    const dates = client.suppressionSources
      .map((s) => s.lastSyncedAt)
      .filter((d): d is NonNullable<typeof d> => d != null);
    if (dates.length === 0) return null;
    return dates.reduce((a, b) => (a > b ? a : b));
  })();

  const lastSyncLabel = (() => {
    if (!suppressionLatestSyncAt) return "Not synced yet";
    return `Last sync ${suppressionLatestSyncAt.toISOString().slice(0, 16).replace("T", " ")} UTC`;
  })();

  const snapshot = {
    clientId: client.id,
    brief: bundle.onboardingCompletion,
    connectedSendingCount: bundle.connectedSendingCount,
    recommendedMailboxCount: REQUIRED_OUTREACH_MAILBOX_COUNT,
    suppressionSheetCount: bundle.suppressionSheetRows.length,
    googleSheetsEnvReady: bundle.googleSheetsEnvReady,
    contactsTotal: client._count.contacts,
    contactsEligible: bundle.pilotContactSummary.eligibleCount,
    contactsSuppressedCount: bundle.pilotContactSummary.suppressedCount,
    rocketReachEnvReady: bundle.rocketReachEnvReady,
    outreachPilotRunnable,
    latestActivityLabel: bundle.latestGovernedAt
      ? new Date(bundle.latestGovernedAt).toISOString().slice(0, 16).replace("T", " ")
      : null,
  };

  const steps = buildClientWorkflowSteps(snapshot);
  const launchStage = deriveLaunchStageLabel(snapshot);

  const readinessRows = buildLaunchReadinessRows({
    ...snapshot,
    suppressionLatestSyncAt,
  });

  const checklistItems = [
    { label: "Staff access / app login", ok: true, detail: "OpensDoors staff session" },
    { label: "Client workspace", ok: client.status === "ACTIVE", detail: client.status },
    {
      label: "Operating brief",
      ok: briefChecklistReady,
      detail: briefChecklistReady
        ? "Required brief fields complete"
        : "Open Brief and complete the operating brief",
    },
    {
      label: "Suppression sheet ids",
      ok: bundle.suppressionSheetRows.length > 0,
      detail:
        bundle.suppressionSheetRows.length > 0
          ? `${String(bundle.suppressionSheetRows.length)} source(s) with spreadsheet id`
          : "Add Sheet URLs under Suppression",
    },
    {
      label: "Google Sheets API (service account)",
      ok: bundle.googleSheetsEnvReady,
      detail: bundle.googleSheetsEnvReady ? "Env present" : "Set GOOGLE_SERVICE_ACCOUNT_JSON*",
    },
    {
      label: "RocketReach API key (import)",
      ok: bundle.rocketReachEnvReady,
      detail: bundle.rocketReachEnvReady ? "ROCKETREACH_API_KEY present" : "Optional until import",
    },
    {
      label: "Contacts / lead rows",
      ok: client._count.contacts > 0,
      detail: `${String(client._count.contacts)} contact(s)`,
    },
    {
      label: "Microsoft mailbox path",
      ok: client.mailboxIdentities.some(
        (m) => m.provider === "MICROSOFT" && m.connectionStatus === "CONNECTED",
      ),
      detail: "At least one connected Microsoft identity",
    },
    {
      label: "Google Workspace mailbox path",
      ok: client.mailboxIdentities.some(
        (m) => m.provider === "GOOGLE" && m.connectionStatus === "CONNECTED",
      ),
      detail: "At least one connected Google identity",
    },
    {
      label: "Governed sender + OAuth env",
      ok: bundle.hasGovernedMailbox && bundle.oauthReadyForGovernedTest,
      detail: bundle.hasGovernedMailbox ? "Mailbox + provider OAuth" : "Connect a mailbox",
    },
    {
      label: "Outreach mailbox capacity",
      ok: bundle.connectedSendingCount >= 1,
      detail: formatOutreachMailboxCapacityChecklistDetail(bundle.connectedSendingCount),
    },
    {
      label: "Inbound fetch",
      ok: client.mailboxIdentities.some(
        (m) =>
          m.connectionStatus === "CONNECTED" &&
          (m.provider === "MICROSOFT" || m.provider === "GOOGLE"),
      ),
      detail: "Use Activity → inbox preview",
    },
    {
      label: "Ledger / pool capacity (UTC day)",
      ok: bundle.aggregateRemaining >= 1,
      detail: `${String(bundle.aggregateRemaining)} remaining today · theoretical max ${String(THEORETICAL_MAX_CLIENT_DAILY_SENDS)} when ${String(REQUIRED_OUTREACH_MAILBOX_COUNT)} eligible mailboxes have capacity (${String(OUTREACH_MAILBOX_DAILY_CAP)} each)`,
    },
    {
      label: "Controlled pilot send",
      ok: outreachPilotRunnable,
      detail: "Uses mailbox pool (not primary-only)",
    },
  ];

  const base = `/clients/${client.id}`;

  const summaryTiles = [
    {
      title: "Operating brief",
      description: "Client context before sourcing and sending",
      metric: `${String(bundle.onboardingCompletion.percent)}% complete`,
      href: `${base}/brief`,
      actionLabel: "Open brief",
    },
    {
      title: "Mailbox capacity",
      description: "Connected senders vs recommended pool",
      metric: `${String(bundle.connectedSendingCount)}/${String(REQUIRED_OUTREACH_MAILBOX_COUNT)} sending`,
      href: `${base}/mailboxes`,
      actionLabel: "Open mailboxes",
    },
    {
      title: "Contacts",
      description: "Eligible vs suppressed (pilot filter)",
      metric: `${String(bundle.pilotContactSummary.eligibleCount)} eligible · ${String(bundle.pilotContactSummary.suppressedCount)} suppressed`,
      href: `${base}/contacts`,
      actionLabel: "Open contacts",
    },
    {
      title: "Suppression",
      description: lastSyncLabel,
      metric:
        bundle.suppressionSheetRows.length > 0
          ? `${String(bundle.suppressionSheetRows.length)} Sheet source(s)`
          : "No spreadsheet ids",
      href: `${base}/suppression`,
      actionLabel: "Open suppression",
    },
    {
      title: "Outreach readiness",
      description: "Controlled pilot prerequisites",
      metric: outreachPilotRunnable ? "Pilot can run" : "Check Outreach module",
      href: `${base}/outreach`,
      actionLabel: "Open outreach",
    },
    {
      title: "Latest activity",
      description: "Governed / pilot ledger (UTC)",
      metric: snapshot.latestActivityLabel ?? "No recent sends",
      href: `${base}/activity`,
      actionLabel: "Open activity",
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Client workspace
        </p>
        <h1 className="sr-only">{client.name}</h1>
      </div>

      <ClientWorkspaceCommandCenter
        clientName={client.name}
        clientSlug={client.slug}
        clientStatus={client.status}
        launchStageLabel={launchStage}
        steps={steps}
      />

      <ClientOverviewSummaryGrid tiles={summaryTiles} />

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>Launch readiness</CardTitle>
          <CardDescription>
            High-level status for this client. Open each module for details.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LaunchReadinessPanel
            rows={readinessRows}
            technicalChecks={<TonightLaunchChecklist items={checklistItems} />}
          />
        </CardContent>
      </Card>
    </div>
  );
}
