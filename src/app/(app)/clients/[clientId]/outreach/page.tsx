import { notFound } from "next/navigation";

import { ClientEmailSequencesPanel } from "@/components/clients/email-sequences/client-email-sequences-panel";
import { SequenceSendPreparationPanel } from "@/components/clients/email-sequences/sequence-send-preparation-panel";
import { ClientEmailTemplatesPanel } from "@/components/clients/email-templates/client-email-templates-panel";
import { ControlledPilotSendPanel } from "@/components/clients/controlled-pilot-send-panel";
import { GovernedTestSendPanel } from "@/components/clients/governed-test-send-panel";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CONTROLLED_PILOT_HARD_MAX_RECIPIENTS } from "@/lib/controlled-pilot-constants";
import { OUTREACH_HERO_ADDENDUM } from "@/lib/mailboxes/mailbox-workspace-model";
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
import { loadClientEmailTemplatesOverview } from "@/server/email-templates/queries";
import { getClientEmailTemplateMutationAllowed } from "@/server/email-templates/mutator-access";
import { loadClientWorkspaceBundle } from "@/server/queries/client-workspace-bundle";
import { getAccessibleClientIds } from "@/server/tenant/access";
import { isMailboxExecutionEligible } from "@/server/mailbox/sending-policy";

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

  const [
    templatesOverview,
    canMutateTemplates,
    sequencesOverview,
    canMutateSequences,
    sequencePrepSnapshots,
    stepSendBundle,
  ] = await Promise.all([
    loadClientEmailTemplatesOverview(client.id),
    getClientEmailTemplateMutationAllowed(staff, client.id),
    loadClientEmailSequencesOverview(client.id),
    getClientEmailSequenceMutationAllowed(staff, client.id),
    loadClientSequencePrepSnapshots(client.id),
    loadSequenceStepSendUiSnapshots(client.id),
  ]);

  const templatesFlash = {
    ok: firstParam(sp.template),
    error: firstParam(sp.templateError),
    focusTemplateId: firstParam(sp.templateId),
  };

  const sequencesFlash = {
    ok: firstParam(sp.sequence),
    error: firstParam(sp.sequenceError),
    focusSequenceId: firstParam(sp.sequenceId),
  };

  const launchMailboxOptions = bundle.mailboxRows
    .filter((m) =>
      isMailboxExecutionEligible({
        isActive: m.isActive,
        connectionStatus: m.connectionStatus,
        canSend: m.canSend,
        isSendingEnabled: m.isSendingEnabled,
        workspaceRemovedAt: m.workspaceRemovedAt
          ? new Date(m.workspaceRemovedAt)
          : null,
      }),
    )
    .map((m) => ({
      id: m.id,
      email: m.email,
      label: m.displayName?.trim() ? m.displayName : m.email,
    }));

  const launchReadinessBySequenceId = buildSequenceLaunchReadinessMap({
    sequences: sequencesOverview.sequences,
    mailbox: {
      connectedSendingCount: bundle.connectedSendingCount,
      aggregateRemainingToday: bundle.aggregateRemaining,
    },
    outboundUnsubscribeReady: isOneClickUnsubscribeReady(),
  });

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Outreach
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">{client.name}</h1>
        <p className="mt-1 text-muted-foreground">
          Build templates and production sequences, review launch checks, and
          send from connected client mailboxes. {OUTREACH_HERO_ADDENDUM}
        </p>
      </div>

      <ClientEmailTemplatesPanel
        clientId={client.id}
        clientName={client.name}
        canMutate={canMutateTemplates}
        overview={templatesOverview}
        flash={templatesFlash}
      />

      <ClientEmailSequencesPanel
        clientId={client.id}
        clientName={client.name}
        canMutate={canMutateSequences}
        overview={sequencesOverview}
        flash={sequencesFlash}
        launchReadinessBySequenceId={launchReadinessBySequenceId}
        mailboxSnapshot={{
          connectedSendingCount: bundle.connectedSendingCount,
          aggregateRemainingToday: bundle.aggregateRemaining,
        }}
        launchMailboxOptions={launchMailboxOptions}
      />

      <SequenceSendPreparationPanel
        clientId={client.id}
        canMutate={canMutateSequences}
        snapshots={sequencePrepSnapshots}
        stepSendSnapshots={stepSendBundle.snapshots}
        stepSendAllowlist={stepSendBundle.allowlist}
      />

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>Send an internal verification email</CardTitle>
          <CardDescription>
            Queue a single message to a governed internal address to confirm
            layout, signature, and personalisation before wider sending.
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
          <CardTitle>Limited first batch (optional)</CardTitle>
          <CardDescription>
            Optional safety cap: send a first small batch to up to{" "}
            {CONTROLLED_PILOT_HARD_MAX_RECIPIENTS} real recipients, spread
            across your connected mailboxes. The panel requires an exact
            confirmation phrase in the field below. Each
            mailbox can send up to {String(OUTREACH_MAILBOX_DAILY_CAP)} emails
            per day. Production sequences use the form and Send preparation
            above; this is an additional optional path.
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
    </div>
  );
}
