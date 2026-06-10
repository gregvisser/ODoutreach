import { notFound } from "next/navigation";

import { ClientSuppressionInlineCard } from "@/components/clients/client-suppression-inline-card";
import { prisma } from "@/lib/db";
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

  // Live entry counts per source so staff can see at a glance that a sync
  // actually landed (the status line alone says "succeeded" but not how
  // many rows are in the do-not-contact store).
  const [emailCounts, domainCounts] = await Promise.all([
    prisma.suppressedEmail.groupBy({
      by: ["sourceId"],
      where: { clientId: client.id },
      _count: { _all: true },
    }),
    prisma.suppressedDomain.groupBy({
      by: ["sourceId"],
      where: { clientId: client.id },
      _count: { _all: true },
    }),
  ]);
  const countBySourceId = new Map<string, number>();
  for (const row of [...emailCounts, ...domainCounts]) {
    if (row.sourceId) countBySourceId.set(row.sourceId, row._count._all);
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Do-not-contact
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          People blocked from outreach — {client.name}
        </h1>
        <p className="mt-1 max-w-3xl text-muted-foreground">
          Anyone on this list is silently skipped before any sequence email is
          sent. Add individual addresses, or whole domains, by connecting a
          Google Sheet below. Unsubscribes and hard bounces add themselves
          automatically.
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
          entryCount: countBySourceId.get(s.id) ?? 0,
        }))}
      />
    </div>
  );
}
