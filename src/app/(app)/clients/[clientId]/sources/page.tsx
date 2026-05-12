import Link from "next/link";
import { notFound } from "next/navigation";

import { ContactImportContractPanel } from "@/components/clients/contact-import-contract-panel";
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

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Sources
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">{client.name}</h1>
        <p className="mt-1 text-muted-foreground">
          Bring contacts into this client by importing from RocketReach or
          uploading a CSV. Every import is saved to a named list you can use
          later when launching a sequence.
        </p>
      </div>

      <ContactImportContractPanel />

      <Card className="border-dashed border-primary/30 bg-primary/5 shadow-sm">
        <CardHeader>
          <CardTitle>CSV upload</CardTitle>
          <CardDescription>
            Run CSV imports from the main{" "}
            <span className="font-medium">Contacts</span> page. You&rsquo;ll
            see a Preview of exactly which rows will be added, updated, or
            skipped before anything is saved —{" "}
            <span className="font-medium">
              Preview never creates contacts on its own.
            </span>{" "}
            Press Confirm import when the preview looks right.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Link
            href={`/contacts?client=${client.id}`}
            className={cn(buttonVariants({ variant: "default", size: "sm" }))}
          >
            Open CSV import for {client.name}
          </Link>
          <p className="text-xs text-muted-foreground">
            The Contacts page filters automatically to this client. Choose a
            target list, upload the file, and press Preview.
          </p>
        </CardContent>
      </Card>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>Lists for this client</CardTitle>
          <CardDescription>
            Contact lists belong to{" "}
            <span className="font-medium">{client.name}</span>. Create a new
            list during import, or reuse an existing list when topping up.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {lists.length === 0 ? (
            <p className="rounded-md border border-dashed border-border/80 bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
              No lists yet. Run an import below to create the first one.
            </p>
          ) : (
            <ul className="divide-y divide-border/60 rounded-md border border-border/80">
              {lists.map((l) => (
                <li
                  key={l.id}
                  className="flex items-center justify-between gap-4 px-4 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{l.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Updated {DATE_FORMATTER.format(l.updatedAt)}
                    </p>
                  </div>
                  <span className="whitespace-nowrap text-xs text-muted-foreground">
                    {l.memberCount}{" "}
                    {l.memberCount === 1 ? "member" : "members"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <RocketReachImportPanel
        clientId={client.id}
        apiKeyConfigured={bundle.rocketReachEnvReady}
        existingLists={lists.map((l) => ({
          id: l.id,
          name: l.name,
          memberCount: l.memberCount,
        }))}
      />
    </div>
  );
}
