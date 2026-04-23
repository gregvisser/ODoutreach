import { notFound } from "next/navigation";

import { ClientGettingStartedCard } from "@/components/clients/client-getting-started-card";
import { ClientLaunchApprovalCard } from "@/components/clients/client-launch-approval-card";
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
  evaluateClientLaunchApproval,
  type LaunchApprovalChecklistItem,
} from "@/lib/clients/client-launch-approval";
import { buildGettingStartedViewModel } from "@/lib/clients/getting-started-view-model";
import { parseOpensDoorsBrief } from "@/lib/opensdoors-brief";
import { prisma } from "@/lib/db";
import {
  formatOutreachMailboxCapacityChecklistDetail,
  OUTREACH_MAILBOX_DAILY_CAP,
  REQUIRED_OUTREACH_MAILBOX_COUNT,
  THEORETICAL_MAX_CLIENT_DAILY_SENDS,
} from "@/lib/outreach-mailbox-model";
import { clientStatusLabel } from "@/lib/ui/status-labels";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import {
  ONE_CLICK_UNSUBSCRIBE_READY,
} from "@/server/clients/launch-approval";
import { getClientEmailSequenceCounts } from "@/server/email-sequences/queries";
import { getClientMailboxMutationAllowed } from "@/server/mailbox-identities/mutator-access";
import { loadClientWorkspaceBundle } from "@/server/queries/client-workspace-bundle";
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
  const justCreated =
    typeof sp.created === "string"
      ? sp.created === "1"
      : Array.isArray(sp.created)
        ? sp.created[0] === "1"
        : false;

  const bundle = await loadClientWorkspaceBundle(clientId, accessible, staff);
  if (!bundle.client) notFound();

  const client = bundle.client;
  const briefChecklistReady = bundle.onboardingCompletion.status === "ready";

  const [sequenceCounts, enrolledContactsCount] = await Promise.all([
    getClientEmailSequenceCounts(client.id),
    prisma.clientEmailSequenceEnrollment.count({
      where: { clientId: client.id },
    }),
  ]);

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

  const gettingStarted = buildGettingStartedViewModel({
    clientId: client.id,
    clientStatus: client.status,
    briefStatus: bundle.onboardingCompletion.status,
    connectedSendingCount: bundle.connectedSendingCount,
    suppressionSheetCount: bundle.suppressionSheetRows.length,
    contactsTotal: client._count.contacts,
    enrolledContactsCount,
    approvedTemplatesCount: sequenceCounts.approvedTemplatesTotal,
    approvedSequencesCount: sequenceCounts.approvedSequencesCount,
    outreachPilotRunnable,
  });

  const briefFields = parseOpensDoorsBrief(client.onboarding?.formData);
  const hasSenderSignature = !!briefFields.emailSignature?.trim();
  const launchApprovalEvaluation = evaluateClientLaunchApproval({
    clientStatus: client.status,
    gettingStarted,
    readinessRows,
    approvedSequencesCount: sequenceCounts.approvedSequencesCount,
    approvedIntroductionTemplatesCount:
      sequenceCounts.approvedIntroductionTemplatesCount,
    enrolledContactsCount,
    hasSenderSignature,
    oneClickUnsubscribeReady: ONE_CLICK_UNSUBSCRIBE_READY,
    mode: "CONTROLLED_INTERNAL",
  });
  const canMutateClient = await getClientMailboxMutationAllowed(staff, client.id);
  const storedChecklist: LaunchApprovalChecklistItem[] | null = (() => {
    const raw = client.launchApprovalChecklist;
    if (!Array.isArray(raw)) return null;
    const items: LaunchApprovalChecklistItem[] = [];
    for (const entry of raw) {
      if (!entry || typeof entry !== "object") continue;
      const e = entry as Record<string, unknown>;
      if (
        typeof e.id === "string" &&
        typeof e.label === "string" &&
        typeof e.ok === "boolean" &&
        typeof e.detail === "string"
      ) {
        items.push({
          id: e.id as LaunchApprovalChecklistItem["id"],
          label: e.label,
          ok: e.ok,
          detail: e.detail,
        });
      }
    }
    return items.length > 0 ? items : null;
  })();
  const approvedByStaff = client.launchApprovedByStaffUserId
    ? await prisma.staffUser.findUnique({
        where: { id: client.launchApprovedByStaffUserId },
        select: { id: true, email: true, displayName: true },
      })
    : null;

  const statusCopy =
    client.status === "ACTIVE"
      ? "Active — approved for live outreach. Modules remain editable."
      : client.status === "PAUSED"
        ? "Paused — outreach suspended. Review suppression, mailboxes, and sequences before resuming."
        : client.status === "ARCHIVED"
          ? "Archived — read-only. No new outreach will be sent from this workspace."
          : "Onboarding — not approved for live outreach. Complete the workspace modules before launch.";

  const dailyCapacity = bundle.connectedSendingCount * OUTREACH_MAILBOX_DAILY_CAP;
  const snapshotItems = [
    {
      label: "Client status",
      value: clientStatusLabel(client.status),
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
      hint: snapshot.latestActivityLabel ? "Most recent send" : "No sends yet",
    },
  ];

  const checklistItems = [
    { label: "Staff sign-in", ok: true, detail: "You're signed in to OpensDoors" },
    {
      label: "Client workspace active",
      ok: client.status === "ACTIVE",
      detail: clientStatusLabel(client.status),
    },
    {
      label: "Operating brief",
      ok: briefChecklistReady,
      detail: briefChecklistReady
        ? "All required fields complete"
        : "Open the brief and complete the required fields",
    },
    {
      label: "Suppression sources",
      ok: bundle.suppressionSheetRows.length > 0,
      detail:
        bundle.suppressionSheetRows.length > 0
          ? `${String(bundle.suppressionSheetRows.length)} Google Sheet${bundle.suppressionSheetRows.length === 1 ? "" : "s"} attached`
          : "Attach at least one suppression sheet",
    },
    {
      label: "Google Sheets integration",
      ok: bundle.googleSheetsEnvReady,
      detail: bundle.googleSheetsEnvReady
        ? "Connected"
        : "Ask an administrator to connect Google Workspace in Settings",
    },
    {
      label: "RocketReach (optional)",
      ok: bundle.rocketReachEnvReady,
      detail: bundle.rocketReachEnvReady
        ? "Connected"
        : "Not connected — CSV upload still works without this",
    },
    {
      label: "Contacts",
      ok: client._count.contacts > 0,
      detail: `${String(client._count.contacts)} contact${client._count.contacts === 1 ? "" : "s"} in workspace`,
    },
    {
      label: "Microsoft 365 mailbox",
      ok: client.mailboxIdentities.some(
        (m) => m.provider === "MICROSOFT" && m.connectionStatus === "CONNECTED",
      ),
      detail: "At least one connected Microsoft mailbox",
    },
    {
      label: "Google Workspace mailbox",
      ok: client.mailboxIdentities.some(
        (m) => m.provider === "GOOGLE" && m.connectionStatus === "CONNECTED",
      ),
      detail: "At least one connected Google Workspace mailbox",
    },
    {
      label: "Test sender ready",
      ok: bundle.hasGovernedMailbox && bundle.oauthReadyForGovernedTest,
      detail: bundle.hasGovernedMailbox
        ? "A connected mailbox can send proof emails"
        : "Connect a mailbox to enable test sends",
    },
    {
      label: "Outreach mailbox capacity",
      ok: bundle.connectedSendingCount >= 1,
      detail: formatOutreachMailboxCapacityChecklistDetail(bundle.connectedSendingCount),
    },
    {
      label: "Inbound reply fetch",
      ok: client.mailboxIdentities.some(
        (m) =>
          m.connectionStatus === "CONNECTED" &&
          (m.provider === "MICROSOFT" || m.provider === "GOOGLE"),
      ),
      detail: "Check Activity → inbox preview to confirm replies are coming in",
    },
    {
      label: "Daily send capacity",
      ok: bundle.aggregateRemaining >= 1,
      detail: `${String(bundle.aggregateRemaining)} send${bundle.aggregateRemaining === 1 ? "" : "s"} remaining today (max ${String(THEORETICAL_MAX_CLIENT_DAILY_SENDS)}/day with ${String(REQUIRED_OUTREACH_MAILBOX_COUNT)} mailboxes at ${String(OUTREACH_MAILBOX_DAILY_CAP)} each)`,
    },
    {
      label: "Pilot send ready",
      ok: outreachPilotRunnable,
      detail: "Uses the full mailbox pool",
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
        logoUrl={client.logoUrl}
        logoAltText={client.logoAltText}
      />

      {justCreated ? (
        <div
          role="status"
          className="rounded-lg border border-emerald-400/60 bg-emerald-50/70 p-4 text-sm text-emerald-900 shadow-sm dark:border-emerald-500/20 dark:bg-emerald-950/30 dark:text-emerald-100"
        >
          <p className="font-medium">Client workspace created.</p>
          <p className="mt-1 text-emerald-900/80 dark:text-emerald-100/80">
            Complete the setup modules below before launch. No emails, imports,
            or suppression syncs have run yet.
          </p>
        </div>
      ) : null}

      <p className="text-sm text-muted-foreground">{statusCopy}</p>

      <ClientGettingStartedCard
        viewModel={gettingStarted}
        clientStatus={client.status}
      />

      <ClientLaunchApprovalCard
        clientId={client.id}
        clientStatus={client.status}
        canMutate={canMutateClient}
        canApprove={launchApprovalEvaluation.canApprove}
        blockers={launchApprovalEvaluation.blockers}
        warnings={launchApprovalEvaluation.warnings}
        checklist={launchApprovalEvaluation.checklist}
        evaluatedMode="CONTROLLED_INTERNAL"
        launchApprovedAt={client.launchApprovedAt?.toISOString() ?? null}
        approvedByStaff={approvedByStaff}
        launchApprovalMode={client.launchApprovalMode}
        launchApprovalNotes={client.launchApprovalNotes}
        storedChecklist={storedChecklist}
      />

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>Launch readiness</CardTitle>
          <CardDescription>
            A section-by-section view of what&apos;s ready and what still needs
            attention before this client goes live.
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
