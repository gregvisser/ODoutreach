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
import { OUTREACH_MAILBOX_DAILY_CAP } from "@/lib/outreach-mailbox-model";
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

  const launchReadinessBySequenceId = buildSequenceLaunchReadinessMap({
    sequences: sequencesOverview.sequences,
    mailbox: {
      connectedSendingCount: bundle.connectedSendingCount,
      aggregateRemainingToday: bundle.aggregateRemaining,
    },
  });

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Outreach
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">{client.name}</h1>
        <p className="mt-1 text-muted-foreground">
          Manage templates and sequences for this client, send internal proof
          emails, and run a small pilot before going live.
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
          <CardTitle>Send an internal test email</CardTitle>
          <CardDescription>
            Queue a single proof email to an internal address so you can see
            how the message lands before pilot or live sends.
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
          <CardTitle>Run a pilot send</CardTitle>
          <CardDescription>
            Send the first message to a small batch of up to{" "}
            {CONTROLLED_PILOT_HARD_MAX_RECIPIENTS} real recipients, spread
            across your connected mailboxes. Type{" "}
            <span className="font-medium">SEND PILOT</span> to confirm. Each
            mailbox can send up to {String(OUTREACH_MAILBOX_DAILY_CAP)} emails
            per day.
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
