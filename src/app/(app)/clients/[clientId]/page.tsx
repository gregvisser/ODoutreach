import { notFound } from "next/navigation";

import { ClientOperationalSnapshot } from "@/components/clients/client-operational-snapshot";
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
  OUTREACH_MAILBOX_DAILY_CAP,
  REQUIRED_OUTREACH_MAILBOX_COUNT,
  THEORETICAL_MAX_CLIENT_DAILY_SENDS,
} from "@/lib/outreach-mailbox-model";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { getClientEmailSequenceCounts } from "@/server/email-sequences/queries";
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

  const sequenceCounts = await getClientEmailSequenceCounts(client.id);

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
    approvedSequencesCount: sequenceCounts.approvedSequencesCount,
    approvedIntroductionTemplatesCount:
      sequenceCounts.approvedIntroductionTemplatesCount,
  };

  const steps = buildClientWorkflowSteps(snapshot);
  const launchStage = deriveLaunchStageLabel(snapshot);

  const readinessRows = buildLaunchReadinessRows({
    ...snapshot,
    suppressionLatestSyncAt,
  });

  const dailyCapacity = bundle.connectedSendingCount * OUTREACH_MAILBOX_DAILY_CAP;
  const snapshotItems = [
    {
      label: "Client status",
      value: client.status,
      hint: "Workspace state",
    },
    {
      label: "Sending mailboxes",
      value: `${String(bundle.connectedSendingCount)}/${String(REQUIRED_OUTREACH_MAILBOX_COUNT)}`,
      hint: `${String(dailyCapacity)}/day capacity`,
    },
    {
      label: "Eligible contacts",
      value: `${String(bundle.pilotContactSummary.eligibleCount)} / ${String(client._count.contacts)}`,
      hint: `${String(bundle.pilotContactSummary.suppressedCount)} suppressed`,
    },
    {
      label: "Latest activity",
      value: snapshot.latestActivityLabel ?? "—",
      hint: snapshot.latestActivityLabel ? "UTC, governed ledger" : "No sends yet",
    },
  ];

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

  return (
    <div className="space-y-8">
      <ClientWorkspaceCommandCenter
        clientName={client.name}
        clientSlug={client.slug}
        clientStatus={client.status}
        launchStageLabel={launchStage}
        steps={steps}
      />

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>Launch readiness</CardTitle>
          <CardDescription>
            The single module-level status view for this client.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LaunchReadinessPanel
            rows={readinessRows}
            technicalChecks={<TonightLaunchChecklist items={checklistItems} />}
          />
        </CardContent>
      </Card>

      <ClientOperationalSnapshot items={snapshotItems} />
    </div>
  );
}
