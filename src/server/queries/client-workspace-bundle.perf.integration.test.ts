/**
 * MEASUREMENT, not a fix. Queue item 2 says measure before touching anything,
 * and that `loadClientWorkspaceBundle` is a suspect, not a cause.
 *
 * This counts and times every SQL round-trip one client-workspace page costs, by
 * instrumenting the `pg` driver itself rather than trusting Prisma's own view.
 * A round-trip count is the part of the answer that does NOT depend on how much
 * data a client has: if one page load costs N queries with an empty database, it
 * costs at least N with a full one, plus whatever the rows add.
 *
 * Run it:
 *   docker run -d --name odoutreach-e2e-postgres \
 *     -e POSTGRES_USER=e2e -e POSTGRES_PASSWORD=e2e_local_only \
 *     -e POSTGRES_DB=odoutreach_e2e -p 5434:5432 postgres:16-alpine
 *   npm run db:migrate:e2e
 *   npm run test:integration -- client-workspace-bundle.perf
 *
 * The printed table is the deliverable. The assertions are only a ratchet, set
 * at the measured numbers so this cannot silently get worse.
 */

import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

type Recorded = { sql: string; ms: number };

const recorded: Recorded[] = [];
let capturing = false;

// Patch the driver, not Prisma.
//
// BOTH prototypes matter, and getting this wrong is how the first version of
// this test reported "0 round-trips" and still passed. `@prisma/adapter-pg`
// calls `this.client.query(...)` where `client` is the POOL, so patching only
// `pg.Client.prototype` captured nothing at all. Pool.query is the real call
// site; Client.prototype is kept for the transaction path, which acquires a
// client via `pool.connect()` first.
const originalPoolQuery = pg.Pool.prototype.query;
const originalClientQuery = pg.Client.prototype.query;

function firstLine(sql: string): string {
  return sql.replace(/\s+/g, " ").trim().slice(0, 140);
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

beforeAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- driver-level patch
  (pg.Pool.prototype as any).query = instrument(originalPoolQuery);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- driver-level patch
  (pg.Client.prototype as any).query = instrument(originalClientQuery);
});

afterAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- restore
  (pg.Pool.prototype as any).query = originalPoolQuery;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- restore
  (pg.Client.prototype as any).query = originalClientQuery;
});

describe("what a client workspace page costs in database round-trips", () => {
  it("counts and times every query, and shows whether the count scales", async () => {
    // Imported lazily so the driver patch above is installed first.
    const { prisma } = await import("@/lib/db");
    const { loadClientWorkspaceBundle } = await import(
      "@/server/queries/client-workspace-bundle"
    );

    const suffix = Math.floor(performance.now() * 1000) % 1_000_000;

    const staff = await prisma.staffUser.create({
      data: {
        entraObjectId: `perf-staff-${suffix}`,
        email: `perf-staff-${suffix}@opensdoors.co.uk`,
      },
    });

    // Production runs 45 mailboxes across 17 clients. Measuring at three sizes
    // answers the question the round-trip count alone cannot: does the number of
    // queries GROW with the data? A constant count means the parallel block is
    // a fixed cost. A growing one means an N+1, which is a different fix.
    const SIZES = [1, 6, 20];
    const results: { mailboxes: number; queries: number; dbMs: number; wallMs: number }[] = [];
    let lastRanked: [string, { n: number; totalMs: number }][] = [];

    for (const mailboxCount of SIZES) {
      const client = await prisma.client.create({
        data: { name: `Perf ${mailboxCount} ${suffix}`, slug: `perf-${mailboxCount}-${suffix}` },
      });

      for (let i = 0; i < mailboxCount; i += 1) {
        const email = `perf${mailboxCount}-${i}-${suffix}@example.com`;
        await prisma.clientMailboxIdentity.create({
          data: {
            clientId: client.id,
            provider: "MICROSOFT",
            email,
            emailNormalized: email.toLowerCase(),
          },
        });
      }

      recorded.length = 0;
      capturing = true;
      const startedAt = performance.now();
      const bundle = await loadClientWorkspaceBundle(client.id, [client.id], staff);
      const wallMs = performance.now() - startedAt;
      capturing = false;

      expect(bundle.client).not.toBeNull();

      // Group identical statements so an N+1 shows up as a repeat count.
      const byStatement = new Map<string, { n: number; totalMs: number }>();
      for (const row of recorded) {
        const key = firstLine(row.sql);
        const existing = byStatement.get(key) ?? { n: 0, totalMs: 0 };
        existing.n += 1;
        existing.totalMs += row.ms;
        byStatement.set(key, existing);
      }
      lastRanked = [...byStatement.entries()].sort((a, b) => b[1].totalMs - a[1].totalMs);

      results.push({
        mailboxes: mailboxCount,
        queries: recorded.length,
        dbMs: recorded.reduce((sum, r) => sum + r.ms, 0),
        wallMs,
      });

      await prisma.clientMailboxIdentity.deleteMany({ where: { clientId: client.id } });
      await prisma.client.delete({ where: { id: client.id } });
    }

    const lines: string[] = [];
    lines.push("");
    lines.push("=".repeat(80));
    lines.push("ONE CLIENT WORKSPACE PAGE - cost of loadClientWorkspaceBundle");
    lines.push("Local Postgres, otherwise EMPTY tables. Round-trip COUNT is the");
    lines.push("data-independent number; the milliseconds are local, not production.");
    lines.push("=".repeat(80));
    lines.push("  mailboxes | SQL round-trips | total DB ms | wall-clock ms");
    lines.push("  ----------|-----------------|-------------|--------------");
    for (const r of results) {
      lines.push(
        `  ${String(r.mailboxes).padStart(9)} | ${String(r.queries).padStart(15)} | ` +
          `${r.dbMs.toFixed(1).padStart(11)} | ${r.wallMs.toFixed(1).padStart(13)}`,
      );
    }
    lines.push("");
    lines.push(`Statements at ${SIZES[SIZES.length - 1]} mailboxes, by total time:`);
    lines.push("");
    for (const [sql, stat] of lastRanked) {
      const flag = stat.n > 1 ? `  <-- runs ${stat.n}x` : "";
      lines.push(
        `  ${stat.totalMs.toFixed(1).padStart(7)} ms  x${String(stat.n).padStart(3)}${flag}`,
      );
      lines.push(`           ${sql}`);
    }
    lines.push("=".repeat(80));
    // This printed table IS the deliverable for queue item 2.
    console.log(lines.join("\n"));

    // FIRST, and non-negotiable: prove the instrumentation actually saw
    // something. The first version of this test patched the wrong prototype,
    // measured nothing, printed "0 round-trips" and PASSED - a measurement that
    // reports a number without measuring is the exact defect this repository
    // keeps finding. A zero here is a broken probe, never a fast page.
    for (const r of results) expect(r.queries).toBeGreaterThan(0);

    // Ratchet. Set above what was measured so this fails on a regression in
    // SHAPE (a new N+1), not on a slow laptop.
    for (const r of results) expect(r.queries).toBeLessThan(60);

    await prisma.staffUser.delete({ where: { id: staff.id } });
  });
});
