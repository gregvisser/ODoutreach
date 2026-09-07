import { afterAll, expect, it, vi } from "vitest";
import { Pool } from "pg";
import { prisma } from "@/lib/db";
import { resetIntegrationDatabase, closeIntegrationPool } from "@/test/integration/database";
import { markInboundReplyHandled } from "./mark-reply-handled";

const pool = new Pool({ connectionString: process.env.E2E_DATABASE_URL, max: 2 });
afterAll(async () => { await prisma.$disconnect(); await pool.end(); await closeIntegrationPool(); });

it("simultaneous staff clicks retain one handled owner and both receive that same result", async () => {
  await resetIntegrationDatabase();
  vi.stubGlobal("fetch", vi.fn(() => { throw Error("No external HTTP in this test"); }));
  const client = await prisma.client.create({ data: { name: "Concurrent handling", slug: "concurrent-handling" } });
  const staff = await Promise.all(["first", "second"].map((id) => prisma.staffUser.create({ data: { id, entraObjectId: id, email: `${id}@test.example` } })));
  const reply = await prisma.inboundReply.create({ data: { clientId: client.id, fromEmail: "prospect@test.example", receivedAt: new Date() } });
  const blocker = await pool.connect();
  let attempts: ReturnType<typeof markInboundReplyHandled>[] = [];
  try {
    await blocker.query("BEGIN");
    await blocker.query('SELECT id FROM "InboundReply" WHERE id=$1 FOR UPDATE', [reply.id]);
    attempts = staff.map((person) => markInboundReplyHandled({ staff: person, clientId: client.id, replyId: reply.id }));
    // Hold the row until both real UPDATEs are waiting, so the old read-then-write
    // implementation deterministically reads the same unhandled state twice.
    let waiting = 0;
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline && waiting < 2) {
      const result = await pool.query(`SELECT COUNT(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%UPDATE%InboundReply%'`);
      waiting = result.rows[0].count;
      if (waiting < 2) await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(waiting).toBe(2);
    await blocker.query("COMMIT");
    const results = await Promise.all(attempts);
    const saved = await prisma.inboundReply.findUniqueOrThrow({ where: { id: reply.id } });
    expect(results).toEqual(results.map(() => ({ ok: true, handledAt: saved.handledAt, handledByStaffUserId: saved.handledByStaffUserId })));
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    await blocker.query("ROLLBACK");
    blocker.release();
    await Promise.allSettled(attempts);
    vi.unstubAllGlobals();
  }
});
