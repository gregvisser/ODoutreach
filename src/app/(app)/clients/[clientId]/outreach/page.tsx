import { notFound } from "next/navigation";

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
import { loadClientWorkspaceBundle } from "@/server/queries/client-workspace-bundle";
import { getAccessibleClientIds } from "@/server/tenant/access";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ clientId: string }>;
};

export default async function ClientOutreachPage({ params }: Props) {
  const staff = await requireOpensDoorsStaff();
  const accessible = await getAccessibleClientIds(staff);
  const { clientId } = await params;

  const bundle = await loadClientWorkspaceBundle(clientId, accessible, staff);
  if (!bundle.client) notFound();
  const client = bundle.client;

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Outreach
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">{client.name}</h1>
        <p className="mt-1 text-muted-foreground">
          Governed proof send and controlled pilot — uses the mailbox pool and reservation ledger.
        </p>
      </div>

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
