import { Suspense } from "react";

import { UniversePageClient } from "@/components/universe/universe-page-client";
import {
  parseUniverseVisibleColumns,
  serializeUniverseVisibleColumns,
} from "@/lib/universe/column-config";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { listClientsForStaff } from "@/server/queries/clients";
import {
  listContactUniversesForTable,
  type UniverseTableQuery,
} from "@/server/queries/contact-universe-list";
import { getAccessibleClientIds } from "@/server/tenant/access";

export const dynamic = "force-dynamic";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function UniversePage({ searchParams }: Props) {
  const staff = await requireOpensDoorsStaff();
  const accessible = await getAccessibleClientIds(staff);
  const sp = searchParams ? await searchParams : {};

  const one = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;

  const q = one(sp.q) ?? "";
  const hasEmail = one(sp.hasEmail) ?? "";
  const company = one(sp.company) ?? "";
  const jobTitle = one(sp.jobTitle) ?? "";
  const country = one(sp.country) ?? "";
  const city = one(sp.city) ?? "";
  const sourceType = one(sp.sourceType) ?? "ALL";
  const sort = one(sp.sort) ?? "lastSeen";
  const page = Math.max(1, Number(one(sp.page) ?? "1") || 1);
  const pageSize = 25;

  const visibleColumnKeys = parseUniverseVisibleColumns(one(sp.cols));
  const visibleColumns = serializeUniverseVisibleColumns(visibleColumnKeys);

  const stRaw = sourceType || "ALL";
  const filterPayload: UniverseTableQuery = {
    q,
    hasEmail: hasEmail as UniverseTableQuery["hasEmail"],
    company,
    jobTitle,
    country,
    city,
    sourceType: stRaw === "ALL" ? "ALL" : (stRaw as UniverseTableQuery["sourceType"]),
    sort: sort as UniverseTableQuery["sort"],
    page,
    pageSize,
  };

  const [clients, { rows, total }] = await Promise.all([
    listClientsForStaff(accessible),
    listContactUniversesForTable(filterPayload),
  ]);

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Universe</h1>
        <p className="mt-1 max-w-3xl text-muted-foreground">
          All imported contacts are stored here for reuse across client workspaces.
        </p>
      </div>

      <Suspense
        fallback={<p className="text-sm text-muted-foreground">Loading Universe…</p>}
      >
        <UniversePageClient
          rows={rows}
          total={total}
          page={page}
          pageSize={pageSize}
          clients={clients.map((c) => ({ id: c.id, name: c.name }))}
          filters={{
            q,
            hasEmail,
            company,
            jobTitle,
            country,
            city,
            sourceType,
            sort,
          }}
          visibleColumns={visibleColumns}
        />
      </Suspense>
    </div>
  );
}
