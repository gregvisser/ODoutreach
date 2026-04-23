import { notFound } from "next/navigation";

import { ClientSuppressionInlineCard } from "@/components/clients/client-suppression-inline-card";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { loadClientWorkspaceBundle } from "@/server/queries/client-workspace-bundle";
import { getAccessibleClientIds } from "@/server/tenant/access";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ clientId: string }>;
};

export default async function ClientSuppressionPage({ params }: Props) {
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
          Suppression
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">{client.name}</h1>
        <p className="mt-1 text-muted-foreground">
          Connect a Google Sheet of do-not-contact addresses so sends to those
          people are blocked automatically.
        </p>
      </div>

      <ClientSuppressionInlineCard
        clientId={client.id}
        clientName={client.name}
        googleServiceAccountConfigured={bundle.googleSheetsEnvReady}
        googleServiceAccountClientEmail={bundle.googleSaDisplay.clientEmail}
        sources={client.suppressionSources.map((s) => ({
          id: s.id,
          kind: s.kind,
          spreadsheetId: s.spreadsheetId,
          sheetRange: s.sheetRange,
          syncStatus: s.syncStatus,
          lastSyncedAt: s.lastSyncedAt?.toISOString() ?? null,
          lastError: s.lastError,
        }))}
      />
    </div>
  );
}
