import Link from "next/link";
import { notFound } from "next/navigation";

import { ClientEmailSequencesPanel } from "@/components/clients/email-sequences/client-email-sequences-panel";
import { SequenceSendPreparationPanel } from "@/components/clients/email-sequences/sequence-send-preparation-panel";
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
import {
  OUTREACH_INTERNAL_TOOLS_COPY,
  OUTREACH_NEXT_STEPS,
} from "@/lib/clients/outreach-operator-copy";
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

  const sequencesFlash = {
    ok: firstParam(sp.sequence),
    error: firstParam(sp.sequenceError),
    focusSequenceId: firstParam(sp.sequenceId),
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

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Outreach
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">{client.name}</h1>
        <p className="mt-1 text-muted-foreground">
          Create an introduction email, choose contacts, choose a sending
          mailbox, preview the message, then send when ready. {OUTREACH_HERO_ADDENDUM}
        </p>
      </div>

      <Card className="border-primary/20 bg-primary/5 shadow-sm">
        <CardHeader>
          <CardTitle>How to launch outreach</CardTitle>
          <CardDescription>
            One introduction email is enough. Follow-ups are optional and can be
            added later.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="grid gap-2 text-sm text-muted-foreground md:grid-cols-3">
            {OUTREACH_NEXT_STEPS.map((step, idx) => (
              <li key={step} className="rounded-md border border-border/70 bg-background/80 px-3 py-2">
                <span className="mr-2 font-semibold text-foreground">{idx + 1}.</span>
                {step}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>Templates</CardTitle>
          <CardDescription>
            Reusable message content lives on the Templates tab. Save templates there, then return
            here to attach them to sequence steps.
          </CardDescription>
        </CardHeader>
        <CardContent>
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

      <details className="rounded-lg border border-dashed border-border/80 bg-muted/10 px-4 py-3">
        <summary className="cursor-pointer text-sm font-semibold text-foreground">
          {OUTREACH_INTERNAL_TOOLS_COPY.title}
        </summary>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          {OUTREACH_INTERNAL_TOOLS_COPY.description}
        </p>
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <Card className="border-border/80 shadow-sm">
            <CardHeader>
              <CardTitle>Send an internal verification email</CardTitle>
              <CardDescription>
                Queue a single message to an allowlisted internal address to confirm
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
                {CONTROLLED_PILOT_HARD_MAX_RECIPIENTS} real recipients. Each
                mailbox can send up to {String(OUTREACH_MAILBOX_DAILY_CAP)} emails
                per day. The main sequence flow above is the normal launch path.
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
      </details>
    </div>
  );
}
