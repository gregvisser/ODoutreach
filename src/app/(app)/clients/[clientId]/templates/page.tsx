import Link from "next/link";
import { notFound } from "next/navigation";

import { AiSequenceDraftPanel } from "@/components/clients/email-templates/ai-sequence-draft-panel";
import { ClientEmailTemplatesPanel } from "@/components/clients/email-templates/client-email-templates-panel";
import { SequenceTemplateStructurePanel } from "@/components/clients/email-templates/sequence-template-structure-panel";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { areAiFeaturesEnabled } from "@/lib/ai/ai-switch";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { loadClientSequenceTemplateStructures } from "@/server/email-sequences/queries";
import { loadClientEmailTemplatesOverview } from "@/server/email-templates/queries";
import { getClientEmailTemplateMutationAllowed } from "@/server/email-templates/mutator-access";
import { loadClientWorkspaceBundle } from "@/server/queries/client-workspace-bundle";
import { getAccessibleClientIds } from "@/server/tenant/access";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ clientId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  if (typeof value === "string" && value.length > 0) return value;
  return null;
}

export default async function ClientTemplatesPage({ params, searchParams }: Props) {
  const staff = await requireOpensDoorsStaff();
  const accessible = await getAccessibleClientIds(staff);
  const { clientId } = await params;
  const sp = searchParams ? await searchParams : {};

  const bundle = await loadClientWorkspaceBundle(clientId, accessible, staff);
  if (!bundle.client) notFound();
  const client = bundle.client;

  const showArchivedTemplates = firstParam(sp.showArchived) === "1";

  const [templatesOverview, canMutateTemplates, sequenceStructures] =
    await Promise.all([
      loadClientEmailTemplatesOverview(client.id, {
        includeArchived: showArchivedTemplates,
      }),
      getClientEmailTemplateMutationAllowed(staff, client.id),
      loadClientSequenceTemplateStructures(client.id),
    ]);

  const templatesFlash = {
    ok: firstParam(sp.template),
    error: firstParam(sp.templateError),
    focusTemplateId: firstParam(sp.templateId),
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Client workspace
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Templates</h1>
          <p className="mt-1 max-w-2xl text-muted-foreground">
            Create reusable email templates for {client.name}. Templates are saved here and
            picked when you build sequences on the{" "}
            <Link prefetch={false}
              href={`/clients/${client.id}/outreach`}
              className="font-medium text-primary underline underline-offset-2"
            >
              Outreach
            </Link>{" "}
            tab.
          </p>
        </div>
      </div>

      <SequenceTemplateStructurePanel structures={sequenceStructures} />

      <ClientEmailTemplatesPanel
        clientId={client.id}
        clientName={client.name}
        canMutate={canMutateTemplates}
        overview={templatesOverview}
        flash={templatesFlash}
        showArchived={showArchivedTemplates}
      />

      <AiSequenceDraftPanel
        clientId={client.id}
        clientName={client.name}
        canMutate={canMutateTemplates}
        aiEnabled={areAiFeaturesEnabled()}
        aiConfigured={Boolean(process.env.ANTHROPIC_API_KEY)}
      />

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>Next: live sequences</CardTitle>
          <CardDescription>
            When templates are ready, open Outreach to create a sequence, enroll recipients, and
            schedule sends.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link prefetch={false}
            href={`/clients/${client.id}/outreach`}
            className={buttonVariants()}
          >
            Go to Outreach
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
