import { notFound } from "next/navigation";

import { ClientEmailSequencesPanel } from "@/components/clients/email-sequences/client-email-sequences-panel";
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

  const [templatesOverview, canMutateTemplates, sequencesOverview, canMutateSequences] =
    await Promise.all([
      loadClientEmailTemplatesOverview(client.id),
      getClientEmailTemplateMutationAllowed(staff, client.id),
      loadClientEmailSequencesOverview(client.id),
      getClientEmailSequenceMutationAllowed(staff, client.id),
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
          Approved email templates, governed proof send, and controlled pilot. Sequences
          and sequence-driven sending are not enabled yet.
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

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>Governed test send (operator)</CardTitle>
          <CardDescription>
            Queue exactly one internal proof email through the reservation ledger — no bulk. For
            verification only.
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
          <CardTitle>Controlled pilot send</CardTitle>
          <CardDescription>
            Queue up to {CONTROLLED_PILOT_HARD_MAX_RECIPIENTS} recipients per run across the{" "}
            <strong>mailbox pool</strong>. Type <span className="font-mono text-xs">SEND PILOT</span> to
            confirm. Pool capacity reflects remaining slots today (cap {String(OUTREACH_MAILBOX_DAILY_CAP)}
            /mailbox in UTC day).
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
