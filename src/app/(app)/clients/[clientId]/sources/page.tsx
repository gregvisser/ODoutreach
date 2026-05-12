import Link from "next/link";
import { notFound } from "next/navigation";

import { CsvImportForm, type ClientListOption } from "@/app/(app)/contacts/csv-import-form";
import { ClientWorkspaceContactLists } from "@/components/clients/client-workspace-contact-lists";
import { RocketReachImportPanel } from "@/components/clients/rocketreach-import-panel";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { listContactListsForClient } from "@/server/contacts/contact-lists";
import { loadClientWorkspaceBundle } from "@/server/queries/client-workspace-bundle";
import { getAccessibleClientIds } from "@/server/tenant/access";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ clientId: string }>;
};

const DATE_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export default async function ClientSourcesPage({ params }: Props) {
  const staff = await requireOpensDoorsStaff();
  const accessible = await getAccessibleClientIds(staff);
  const { clientId } = await params;

  const bundle = await loadClientWorkspaceBundle(clientId, accessible, staff);
  if (!bundle.client) notFound();
  const client = bundle.client;

  const lists = await listContactListsForClient(client.id);
  const listOptions: ClientListOption[] = lists.map((l) => ({
    id: l.id,
    name: l.name,
    memberCount: l.memberCount,
  }));
  const listsForPanel = lists.map((l) => ({
    id: l.id,
    name: l.name,
    memberCount: l.memberCount,
    updatedAt: DATE_FORMATTER.format(l.updatedAt),
  }));

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Sources</p>
        <h1 className="text-3xl font-semibold tracking-tight">{client.name}</h1>
        <p className="mt-1 max-w-3xl text-muted-foreground">
          Import contacts into a named list for this client. Upload a CSV or use RocketReach below.
        </p>
      </div>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>Lists for this client</CardTitle>
          <CardDescription>
            Lists belong to this workspace only. Deleting a list only removes that list from this client.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ClientWorkspaceContactLists clientId={client.id} lists={listsForPanel} />
        </CardContent>
      </Card>

      <section className="space-y-3">
        <CsvImportForm
          clients={[{ id: client.id, name: client.name }]}
          listsByClientId={{ [client.id]: listOptions }}
          lockedClientId={client.id}
        />
        <p className="text-xs text-muted-foreground">
          Cross-client tools and history:{" "}
          <Link href="/contacts" className={cn(buttonVariants({ variant: "link", size: "sm" }), "h-auto p-0")}>
            Contacts
          </Link>
        </p>
      </section>

      <RocketReachImportPanel
        clientId={client.id}
        apiKeyConfigured={bundle.rocketReachEnvReady}
        existingLists={listOptions}
        allowAdvancedRocketReachJson={staff.role === "ADMIN"}
      />
    </div>
  );
}
