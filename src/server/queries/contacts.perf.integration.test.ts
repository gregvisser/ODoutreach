/**
 * Queue item 27, defect (9) — "/contacts takes 19,265 ms and ships 2,977 KB of
 * HTML" and "/operations/outbound takes 8,564 ms", both measured in Chrome on
 * the live site on 2026-08-26.
 *
 * The document weight is a rendering cost and is measured in a real browser by
 * `e2e/contacts-pagination.spec.ts`. This file measures the OTHER half — how
 * many times each page asks the database — because /contacts also carried a
 * per-workspace fan-out that no amount of paging would have fixed:
 * `listContactListsForClient` was called inside `clients.map(...)`, purely to
 * preload a dropdown, so opening the page cost one extra query per workspace.
 * Production runs 17.
 *
 * The assertions are a ratchet in the same shape cycle 24 used on /reporting:
 * the round-trip count must not GROW with the number of workspaces. Flat is a
 * fixed cost; rising is an N+1, and rising is invisible on a developer's
 * machine with one client in the database.
 *
 * Run it:
 *   docker run -d --name odoutreach-e2e-postgres \
 *     -e POSTGRES_USER=e2e -e POSTGRES_PASSWORD=e2e_local_only \
 *     -e POSTGRES_DB=odoutreach_e2e -p 5434:5432 postgres:16-alpine
 *   npm run db:migrate:e2e
 *   npm run test:integration -- contacts.perf
 */

import pg from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  closeIntegrationPool,
  resetIntegrationDatabase,
} from "@/test/integration/database";

type Recorded = { sql: string; ms: number };

const recorded: Recorded[] = [];
let capturing = false;

// Patch the DRIVER, not Prisma — `@prisma/adapter-pg` calls `query` on the
// POOL, so patching only `pg.Client.prototype` captures nothing and reports a
// triumphant zero. That mistake has already been made once in this repository.
const originalPoolQuery = pg.Pool.prototype.query;
const originalClientQuery = pg.Client.prototype.query;

function firstLine(sql: string): string {
  return sql.replace(/\s+/g, " ").trim().slice(0, 110);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- driver-level patch
function instrument(original: any) {
  return function patched(this: unknown, ...args: unknown[]) {
    const start = performance.now();
    const head = args[0];
    const sql =
      typeof head === "string"
        ? head
        : ((head as { text?: string } | undefined)?.text ?? "<non-text query>");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- forwarding to the real driver
    const result = (original as any).apply(this, args);

    if (result && typeof (result as Promise<unknown>).then === "function") {
      const done = () => {
        if (capturing) recorded.push({ sql, ms: performance.now() - start });
      };
      (result as Promise<unknown>).then(done, done);
    }
    return result;
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- driver-level patch
(pg.Pool.prototype as any).query = instrument(originalPoolQuery);
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- driver-level patch
(pg.Client.prototype as any).query = instrument(originalClientQuery);

afterAll(async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- restore
  (pg.Pool.prototype as any).query = originalPoolQuery;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- restore
  (pg.Client.prototype as any).query = originalClientQuery;
  await closeIntegrationPool();
});

beforeEach(async () => {
  await resetIntegrationDatabase();
});

/** Run `fn` with the driver recorder on, and hand back what it cost. */
async function measure<T>(fn: () => Promise<T>): Promise<{
  value: T;
  queries: number;
  dbMs: number;
  statements: Recorded[];
}> {
  recorded.length = 0;
  capturing = true;
  const value = await fn();
  capturing = false;
  return {
    value,
    queries: recorded.length,
    dbMs: recorded.reduce((sum, r) => sum + r.ms, 0),
    statements: [...recorded],
  };
}

function report(
  title: string,
  results: { clients: number; queries: number; dbMs: number }[],
  statements: Recorded[],
): void {
  const byStatement = new Map<string, number>();
  for (const row of statements) {
    const key = firstLine(row.sql);
    byStatement.set(key, (byStatement.get(key) ?? 0) + 1);
  }
  const lines: string[] = ["", "=".repeat(78), title];
  lines.push("Local Postgres, near-empty tables. The round-trip COUNT is the");
  lines.push("data-independent number; the milliseconds are local, not prod.");
  lines.push("=".repeat(78));
  lines.push("   workspaces | SQL round-trips | total DB ms");
  lines.push("   -----------|-----------------|------------");
  for (const r of results) {
    lines.push(
      `   ${String(r.clients).padStart(10)} | ${String(r.queries).padStart(15)} | ${r.dbMs
        .toFixed(1)
        .padStart(11)}`,
    );
  }
  lines.push("");
  lines.push("Statements on the largest run:");
  for (const [sql, n] of [...byStatement.entries()].sort((a, b) => b[1] - a[1])) {
    lines.push(`   x${String(n).padStart(3)}  ${sql}`);
  }
  lines.push("=".repeat(78));
  // The printed table is the deliverable a human reads.
  console.log(lines.join("\n"));
}

/** 17 is what production actually runs (see the 2026-08-26 UX walk). */
const SIZES = [1, 5, 17];

describe("what the two admin-only pages cost in database round-trips", () => {
  it("/contacts does not issue more queries as more workspaces are added", async () => {
    const { prisma } = await import("@/lib/db");
    const { listContactsForStaff } = await import("@/server/queries/contacts");
    const { listClientsForStaff } = await import("@/server/queries/clients");
    const { listContactListsForClients } = await import(
      "@/server/contacts/contact-lists"
    );

    /** Exactly the data-loading half of `src/app/(app)/contacts/page.tsx`. */
    async function loadContactsPage(ids: string[]) {
      const [contacts, clients] = await Promise.all([
        listContactsForStaff({ accessibleClientIds: ids }),
        listClientsForStaff(ids),
      ]);
      const lists = await listContactListsForClients(clients.map((c) => c.id));
      return { contacts, clients, lists };
    }

    // Warm the pool and Prisma's first-use chatter so the first size is not
    // charged for connection setup.
    await loadContactsPage([]);

    const ids: string[] = [];
    const results: { clients: number; queries: number; dbMs: number }[] = [];
    let lastStatements: Recorded[] = [];

    for (const size of SIZES) {
      while (ids.length < size) {
        const n = ids.length;
        const client = await prisma.client.create({
          data: { name: `Contacts ${n}`, slug: `contacts-perf-${n}` },
        });
        // A list per workspace, so the picker preload has something to fetch.
        // Without these rows the fan-out this test exists to catch would still
        // happen, but every query would return nothing and look free.
        await prisma.contactList.create({
          data: { clientId: client.id, name: `List ${n}` },
        });
        ids.push(client.id);
      }

      const run = await measure(() => loadContactsPage([...ids]));
      expect(run.value.clients).toHaveLength(size);
      // Positive control on the fixture: the picker really was populated, so a
      // flat query count below means one batched read, not zero reads.
      expect(Object.values(run.value.lists).flat()).toHaveLength(size);

      results.push({ clients: size, queries: run.queries, dbMs: run.dbMs });
      lastStatements = run.statements;
    }

    report(
      "/contacts - cost of the page's data load",
      results,
      lastStatements,
    );

    // FIRST: prove the probe saw anything at all. A zero here is a broken
    // instrument, never a fast page.
    for (const r of results) expect(r.queries).toBeGreaterThan(0);

    // THE POINT OF THIS TEST. Seventeen workspaces must not cost seventeen
    // times one workspace. Before the fix the contact-list preload added one
    // query per workspace on top of a fixed base.
    const [one, , seventeen] = results;
    expect(seventeen!.queries).toBeLessThanOrEqual(one!.queries);

    // Ratchet, set above the constant cost so a slow machine cannot fail it
    // but a reintroduced fan-out can.
    for (const r of results) expect(r.queries).toBeLessThanOrEqual(10);
  });

  it("/operations/outbound does not issue more queries as more workspaces are added", async () => {
    const { prisma } = await import("@/lib/db");
    const { listClientsForStaff } = await import("@/server/queries/clients");
    const { getOutboundOperationsSnapshot } = await import(
      "@/server/queries/outbound-operations"
    );

    /** The data-loading half of `src/app/(app)/operations/outbound/page.tsx`. */
    async function loadOpsPage(ids: string[]) {
      const clients = await listClientsForStaff(ids);
      const snap = await getOutboundOperationsSnapshot(ids);
      return { clients, snap };
    }

    await loadOpsPage([]);

    const ids: string[] = [];
    const results: { clients: number; queries: number; dbMs: number }[] = [];
    let lastStatements: Recorded[] = [];

    for (const size of SIZES) {
      while (ids.length < size) {
        const n = ids.length;
        const client = await prisma.client.create({
          data: { name: `Ops ${n}`, slug: `ops-perf-${n}` },
        });
        ids.push(client.id);
      }

      const run = await measure(() => loadOpsPage([...ids]));
      expect(run.value.clients).toHaveLength(size);

      results.push({ clients: size, queries: run.queries, dbMs: run.dbMs });
      lastStatements = run.statements;
    }

    report(
      "/operations/outbound - cost of the page's data load",
      results,
      lastStatements,
    );

    for (const r of results) expect(r.queries).toBeGreaterThan(0);

    const [one, , seventeen] = results;
    expect(seventeen!.queries).toBeLessThanOrEqual(one!.queries);
    // 21 is the MEASURED constant, not a target: Prisma loads each included
    // relation as its own statement, and this page has five findMany calls with
    // up to three relations each. It is flat at 1, 5 and 17 workspaces, so it is
    // a fixed cost rather than the fan-out the queue brief suspected. Ratchet
    // set just above it so a NEW per-workspace query cannot slip in unnoticed.
    for (const r of results) expect(r.queries).toBeLessThanOrEqual(25);
  });
});
