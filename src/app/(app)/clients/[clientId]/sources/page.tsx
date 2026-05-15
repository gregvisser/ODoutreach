import { notFound } from "next/navigation";

import { CsvImportForm, type ClientListOption } from "@/app/(app)/contacts/csv-import-form";
import { ClientWorkspaceContactLists } from "@/components/clients/client-workspace-contact-lists";
import { RocketReachImportPanel } from "@/components/clients/rocketreach-import-panel";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { STAFF_VISIBLE_CONTACT_IMPORT_HEADERS } from "@/lib/contact-import-contract";
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
            Lists belong to this workspace only. Click a list to open delivery status and members.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ClientWorkspaceContactLists clientId={client.id} lists={listsForPanel} />
        </CardContent>
      </Card>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>What we import for every contact</CardTitle>
          <CardDescription>
            Both CSV upload and RocketReach search write contacts using exactly the same twelve fields.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul
            aria-label="Contact import fields"
            className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3 md:grid-cols-4"
          >
            {STAFF_VISIBLE_CONTACT_IMPORT_HEADERS.map((label) => (
              <li
                key={label}
                className="rounded-md border border-border/60 bg-muted/30 px-2.5 py-1 font-mono text-xs"
              >
                {label}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            Fields can be empty. A contact must have at least one of email,
            LinkedIn, mobile, or office number to be saved. Today, email is
            still required to deliver outreach.
          </p>
        </CardContent>
      </Card>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>CSV import</CardTitle>
          <CardDescription>
            Upload a spreadsheet to add contacts to this client&rsquo;s list.
            You can preview the file before saving.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CsvImportForm
            clients={[{ id: client.id, name: client.name }]}
            listsByClientId={{ [client.id]: listOptions }}
            lockedClientId={client.id}
          />
        </CardContent>
      </Card>

      <RocketReachImportPanel
        clientId={client.id}
        apiKeyConfigured={bundle.rocketReachEnvReady}
        existingLists={listOptions}
        allowAdvancedRocketReachJson={
          process.env.ROCKETREACH_IMPORT_JSON_DEBUG === "1" ||
          process.env.ROCKETREACH_IMPORT_JSON_DEBUG === "true"
        }
      />
    </div>
  );
}
