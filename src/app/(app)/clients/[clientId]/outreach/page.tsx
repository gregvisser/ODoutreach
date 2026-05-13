import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminOutreachDiagnosticsPanel } from "@/components/clients/admin-outreach-diagnostics-panel";
import { ClientEmailSequencesPanel } from "@/components/clients/email-sequences/client-email-sequences-panel";
import { ControlledPilotSendPanel } from "@/components/clients/controlled-pilot-send-panel";
import { GovernedTestSendPanel } from "@/components/clients/governed-test-send-panel";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { CONTROLLED_PILOT_HARD_MAX_RECIPIENTS } from "@/lib/controlled-pilot-constants";
import { OUTREACH_PAGE_SUBTITLE, OUTREACH_PAGE_TITLE } from "@/lib/clients/outreach-staff-copy";
import { OUTREACH_MAILBOX_DAILY_CAP } from "@/lib/outreach-mailbox-model";
import { isOneClickUnsubscribeReady } from "@/lib/unsubscribe/one-click-readiness";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import {
  buildSequenceLaunchReadinessMap,
  loadClientEmailSequencesOverview,
} from "@/server/email-sequences/queries";
import { getClientEmailSequenceMutationAllowed } from "@/server/email-sequences/mutator-access";
import { loadSequenceStepSendUiSnapshots } from "@/server/email-sequences/send-introduction";
import { loadClientSequencePrepSnapshots } from "@/server/email-sequences/step-sends";
import { loadClientWorkspaceBundle } from "@/server/queries/client-workspace-bundle";
import { getAccessibleClientIds } from "@/server/tenant/access";
import { isMailboxExecutionEligible } from "@/server/mailbox/sending-policy";
import { mailboxRowOperatorStatus } from "@/lib/mailboxes/mailboxes-operator-model";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ clientId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(
  value: string | string[] | undefined,
): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  if (typeof value === "string" && value.length > 0) return value;
  return null;
}

export default async function ClientOutreachPage({
  params,
  searchParams,
}: Props) {
  const staff = await requireOpensDoorsStaff();
  const accessible = await getAccessibleClientIds(staff);
  const { clientId } = await params;
  const sp = searchParams ? await searchParams : {};

  const bundle = await loadClientWorkspaceBundle(clientId, accessible, staff);
  if (!bundle.client) notFound();
  const client = bundle.client;

  const [sequencesOverview, canMutateSequences, sequencePrepSnapshots, stepSendBundle] =
    await Promise.all([
      loadClientEmailSequencesOverview(client.id),
      getClientEmailSequenceMutationAllowed(staff, client.id),
      loadClientSequencePrepSnapshots(client.id),
      loadSequenceStepSendUiSnapshots(client.id),
    ]);

  const sequenceFlashRaw = firstParam(sp.sequence);
  const sequenceIdFromQuery = firstParam(sp.sequenceId);
  const idFromSequenceParam =
    sequenceFlashRaw &&
    sequencesOverview.sequences.some((s) => s.id === sequenceFlashRaw)
      ? sequenceFlashRaw
      : null;
  const flashOk =
    sequenceFlashRaw && !idFromSequenceParam ? sequenceFlashRaw : null;

  const selectedSequenceId =
    sequenceIdFromQuery &&
    sequencesOverview.sequences.some((s) => s.id === sequenceIdFromQuery)
      ? sequenceIdFromQuery
      : idFromSequenceParam;

  const showSequenceEditForm = firstParam(sp.edit) === "1";

  const sequencesFlash = {
    ok: flashOk,
    error: firstParam(sp.sequenceError),
    focusSequenceId: sequenceIdFromQuery,
  };

  const launchMailboxOptions = bundle.mailboxRows
    .filter((m) => !m.workspaceRemovedAt && m.isActive)
    .map((m) => {
      const eligible = isMailboxExecutionEligible({
        isActive: m.isActive,
        connectionStatus: m.connectionStatus,
        canSend: m.canSend,
        isSendingEnabled: m.isSendingEnabled,
        workspaceRemovedAt: m.workspaceRemovedAt
          ? new Date(m.workspaceRemovedAt)
          : null,
      });
      const status = mailboxRowOperatorStatus(m);
      const readiness = bundle.sendingReadinessByMailboxId[m.id];
      const capBlocked = readiness?.atLedgerCap === true;
      return {
        id: m.id,
        email: m.email,
        label: m.displayName?.trim() ? m.displayName : m.email,
        disabled: !eligible || capBlocked,
        disabledReason: capBlocked
          ? "Daily limit reached for this mailbox."
          : eligible
            ? undefined
            : status.sublabel ?? status.label,
      };
    });

  const launchReadinessBySequenceId = buildSequenceLaunchReadinessMap({
    sequences: sequencesOverview.sequences,
    mailbox: {
      connectedSendingCount: bundle.connectedSendingCount,
      aggregateRemainingToday: bundle.aggregateRemaining,
    },
    outboundUnsubscribeReady: isOneClickUnsubscribeReady(),
  });

  const isAdmin = staff.role === "ADMIN";

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {client.name}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">{OUTREACH_PAGE_TITLE}</h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">{OUTREACH_PAGE_SUBTITLE}</p>
      </div>

      <Card className="border-border/80 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Actions</CardTitle>
          <CardDescription>
            Create a sequence here, edit templates on the Templates tab, then open one sequence at a
            time to review recipients and launch.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Link
            href={`/clients/${client.id}/templates`}
            className={buttonVariants({ variant: "secondary" })}
          >
            Manage templates
          </Link>
        </CardContent>
      </Card>

      <ClientEmailSequencesPanel
        clientId={client.id}
        clientName={client.name}
        canMutate={canMutateSequences}
        overview={sequencesOverview}
        flash={sequencesFlash}
        selectedSequenceId={selectedSequenceId}
        showSequenceEditForm={showSequenceEditForm}
        launchReadinessBySequenceId={launchReadinessBySequenceId}
        mailboxSnapshot={{
          connectedSendingCount: bundle.connectedSendingCount,
          aggregateRemainingToday: bundle.aggregateRemaining,
        }}
        launchMailboxOptions={launchMailboxOptions}
        sequencePrepSnapshots={sequencePrepSnapshots}
        stepSendSnapshots={stepSendBundle.snapshots}
      />

      <AdminOutreachDiagnosticsPanel isAdmin={isAdmin}>
        <Card className="border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle>Internal verification send</CardTitle>
            <CardDescription>
              Send a single message to an allowlisted internal address to confirm layout and
              personalisation.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <GovernedTestSendPanel
              clientId={client.id}
              canMutate={bundle.canMutateMailboxes}
              hasGovernedMailbox={bundle.hasGovernedMailbox}
              oauthReadyForGovernedTest={bundle.oauthReadyForGovernedTest}
            />
          </CardContent>
        </Card>

        <Card className="border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle>Limited first batch (legacy)</CardTitle>
            <CardDescription>
              Optional capped path: up to {String(CONTROLLED_PILOT_HARD_MAX_RECIPIENTS)} recipients
              per run. Each mailbox can send up to {String(OUTREACH_MAILBOX_DAILY_CAP)} emails per UTC
              day.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ControlledPilotSendPanel
              key={`pilot-${client.id}-${bundle.brief.pilotSubjectTemplate ?? ""}-${bundle.brief.pilotBodyTemplate ?? ""}`}
              clientId={client.id}
              canMutate={bundle.canMutateMailboxes}
              prerequisites={bundle.pilotPrerequisites}
              initialSubject={bundle.brief.pilotSubjectTemplate}
              initialBody={bundle.brief.pilotBodyTemplate}
              contactSummary={bundle.pilotContactSummary}
            />
          </CardContent>
        </Card>
      </AdminOutreachDiagnosticsPanel>
    </div>
  );
}
