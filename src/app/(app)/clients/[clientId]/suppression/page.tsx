import { notFound } from "next/navigation";

import { ClientSuppressionInlineCard } from "@/components/clients/client-suppression-inline-card";
import { ManualDncAddForm } from "@/components/suppression/add-to-dnc";
import { DomainFamilyPanel } from "@/components/suppression/domain-family-panel";
import { FamilyProposalPanel } from "@/components/suppression/family-proposal-panel";
import { listDomainFamiliesForClient } from "@/server/suppression/domain-families";
import { listPendingFamilyProposals } from "@/server/suppression/family-proposals";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  // Source-attributed counts (from a connected sheet). Manual blocks are
  // stored with a null sourceId by design, so they belong to no source row —
  // surface them separately below instead of silently dropping them (otherwise
  // an operator who manually blocked 50 leads sees "0 on the list").
  const countBySourceId = new Map<string, number>();
  let manualEmailCount = 0;
  let manualDomainCount = 0;
  for (const row of emailCounts) {
    if (row.sourceId) countBySourceId.set(row.sourceId, row._count._all);
    else manualEmailCount = row._count._all;
  }
  for (const row of domainCounts) {
    if (row.sourceId) countBySourceId.set(row.sourceId, row._count._all);
    else manualDomainCount = row._count._all;
  }
  const manualCount = manualEmailCount + manualDomainCount;

  // Ruling 3 — related-company domain families for this client. Each member is
  // marked with whether it is itself suppressed, which is what decides whether
  // the family blocks anything at all.
  const domainFamilies = await listDomainFamiliesForClient(client.id);

  // Machine-found links awaiting a yes or no. These are QUESTIONS: a pending
  // proposal blocks nothing until someone confirms it, which is what keeps
  // Ruling 3 (membership is a human-confirmed fact) intact while removing the
  // requirement that a human first NOTICE the relationship.
  const familyProposals = await listPendingFamilyProposals(client.id);

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

      <Card className="border-border/80 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Quick add</CardTitle>
          <CardDescription>
            Captured a lead or had an opt-out request? Block them here and
            it&apos;s enforced on the very next send — add them to the Google
            Sheet later (or not at all).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ManualDncAddForm clientId={client.id} />
          <p className="text-xs text-muted-foreground">
            {manualCount === 0
              ? "Nothing blocked manually yet — these are entries you add here, separate from any connected sheet."
              : `${manualCount} blocked manually (added here, not from a sheet)${
                  manualDomainCount > 0
                    ? ` — ${manualEmailCount} ${manualEmailCount === 1 ? "address" : "addresses"}, ${manualDomainCount} ${manualDomainCount === 1 ? "domain" : "domains"}`
                    : ""
                }.`}
          </p>
        </CardContent>
      </Card>

      <Card className="border-border/80 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            Related domains we found for you
          </CardTitle>
          <CardDescription>
            Some companies use more than one domain, and blocking{" "}
            <span className="font-mono">bt.com</span> does not block{" "}
            <span className="font-mono">bteurope.com</span> by itself. We check
            every company on this client&apos;s lists against what those
            companies publish about their own email, and bring you anything that
            looks like the same business. Nothing is blocked until you say yes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FamilyProposalPanel
            clientId={client.id}
            proposals={familyProposals}
          />
        </CardContent>
      </Card>

      <Card className="border-border/80 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            Related company domains you have confirmed
          </CardTitle>
          <CardDescription>
            Every domain approved above appears here, alongside any you add
            yourself. Blocking any one domain in a group blocks them all, for
            this client only. Adding one by hand is a fallback — the check above
            is the intended route.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DomainFamilyPanel clientId={client.id} families={domainFamilies} />
        </CardContent>
      </Card>

      <ClientSuppressionInlineCard
        clientId={client.id}
        clientName={client.name}
        canManageSheets
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
