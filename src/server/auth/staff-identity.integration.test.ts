import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import { Pool } from "pg";
import { prisma } from "@/lib/db";
import { resetIntegrationDatabase, closeIntegrationPool } from "@/test/integration/database";
import { requireStaffUser } from "./staff";

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));
const pool = new Pool({ connectionString: process.env.E2E_DATABASE_URL, max: 2 });
const session = (id: string) => ({ user: { id, email: "staff@opendoors.test", name: "Staff" } });

beforeEach(async () => {
  vi.stubEnv("STAFF_EMAIL_DOMAINS", "opendoors.test");
  vi.stubGlobal("fetch", vi.fn(() => { throw Error("External HTTP forbidden"); }));
  authMock.mockReset();
  await resetIntegrationDatabase();
  await prisma.staffUser.create({ data: {
    id: "staff", entraObjectId: "saved-identity", email: "staff@opendoors.test", role: "OPERATOR",
  } });
});
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
afterAll(async () => { await prisma.$disconnect(); await pool.end(); await closeIntegrationPool(); });

it.each(["NONE", "ACCEPTED"] as const)("cannot replace a registered staff identity by email in state %s", async (guestInvitationState) => {
  await prisma.staffUser.update({ where: { id: "staff" }, data: { guestInvitationState } });
  authMock.mockResolvedValue(session("different-identity"));
  await expect(requireStaffUser()).rejects.toThrow("Unauthorized");
  expect(await prisma.staffUser.findUniqueOrThrow({ where: { id: "staff" } })).toMatchObject({ entraObjectId: "saved-identity", guestInvitationState });
  authMock.mockResolvedValue(session("saved-identity"));
  expect(await requireStaffUser()).toMatchObject({ id: "staff", entraObjectId: "saved-identity" });
});

it("requires the recorded Graph guest identity even when a different identity has the invited email", async () => {
  await prisma.staffUser.update({ where: { id: "staff" }, data: { guestInvitationState: "PENDING", graphInvitedUserObjectId: "expected-guest" } });
  authMock.mockResolvedValue(session("different-identity"));
  await expect(requireStaffUser()).rejects.toThrow("Unauthorized");
  expect(await prisma.staffUser.findUniqueOrThrow({ where: { id: "staff" } })).toMatchObject({ entraObjectId: "saved-identity", guestInvitationState: "PENDING" });
  authMock.mockResolvedValue({ user: { id: "expected-guest", email: "guest#ext#@directory.test" } });
  expect(await requireStaffUser()).toMatchObject({ id: "staff", entraObjectId: "expected-guest", guestInvitationState: "ACCEPTED" });
});

it("binds a pending legacy invitation once, then rejects a second email match", async () => {
  await prisma.staffUser.update({ where: { id: "staff" }, data: { guestInvitationState: "PENDING" } });
  authMock.mockResolvedValue(session("first-identity"));
  expect(await requireStaffUser()).toMatchObject({ entraObjectId: "first-identity", guestInvitationState: "ACCEPTED" });
  authMock.mockResolvedValue(session("second-identity"));
  await expect(requireStaffUser()).rejects.toThrow("Unauthorized");
  expect(await prisma.staffUser.findUniqueOrThrow({ where: { id: "staff" } })).toMatchObject({ entraObjectId: "first-identity" });
});

it("allows only one identity when two first sign-ins race for the same pending invitation", async () => {
  await prisma.staffUser.update({ where: { id: "staff" }, data: { guestInvitationState: "PENDING" } });
  const blocker = await pool.connect();
  let attempts: ReturnType<typeof requireStaffUser>[] = [];
  let results: Promise<PromiseSettledResult<Awaited<ReturnType<typeof requireStaffUser>>>[]> | undefined;
  try {
    await blocker.query("BEGIN");
    await blocker.query('SELECT id FROM "StaffUser" WHERE id=$1 FOR UPDATE', ["staff"]);
    authMock.mockResolvedValueOnce(session("first-identity")).mockResolvedValueOnce(session("second-identity"));
    attempts = [requireStaffUser(), requireStaffUser()];
    results = Promise.allSettled(attempts);
    let waiting = 0;
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline && waiting < 2) {
      const result = await pool.query(`SELECT COUNT(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%UPDATE%StaffUser%'`);
      waiting = result.rows[0].count;
      if (waiting < 2) await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(waiting).toBe(2);
    await blocker.query("COMMIT");
    const outcomes = await results;
    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((result) => result.status === "rejected")).toHaveLength(1);
    const saved = await prisma.staffUser.findUniqueOrThrow({ where: { id: "staff" } });
    const winner = outcomes.find((result) => result.status === "fulfilled");
    expect(winner?.status === "fulfilled" && winner.value.entraObjectId).toBe(saved.entraObjectId);
    authMock.mockResolvedValue(session(saved.entraObjectId === "first-identity" ? "second-identity" : "first-identity"));
    await expect(requireStaffUser()).rejects.toThrow("Unauthorized");
  } finally {
    await blocker.query("ROLLBACK");
    blocker.release();
    await results;
  }
});
