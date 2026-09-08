import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetIntegrationDatabase, closeIntegrationPool } from "@/test/integration/database";
import { createClientFromOnboarding } from "@/app/(app)/clients/actions";
import { requireStaffUser } from "./staff";
const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const request = { name: "New customer", slug: "new-customer" };

async function removeFault() {
  await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS owner_creation_fault ON "AuditLog"');
  await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS owner_creation_fault()');
}
beforeEach(async () => {
  vi.stubEnv("STAFF_EMAIL_DOMAINS", "opendoors.test");
  vi.stubGlobal("fetch", vi.fn(() => { throw Error("External HTTP forbidden"); }));
  await removeFault();
  await resetIntegrationDatabase();
  await prisma.staffUser.create({ data: { id: "actor", entraObjectId: "actor-oid", email: "staff@opendoors.test", role: "OPERATOR" } });
  authMock.mockResolvedValue({ user: { id: "actor-oid", email: "staff@opendoors.test", name: "Staff" } });
});
afterEach(async () => {
  await removeFault();
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals(); vi.unstubAllEnvs();
});
afterAll(async () => { await prisma.$disconnect(); await closeIntegrationPool(); });

describe("OpenDoors staff boundary against PostgreSQL", () => {
  it.each(["OPERATOR", "ADMIN", "MANAGER", "VIEWER"] as const)("lets non-owner %s staff create an audited onboarding client", async (role) => {
    await prisma.staffUser.update({ where: { id: "actor" }, data: { role } });
    const result = await createClientFromOnboarding(request);
    expect(result.ok).toBe(true);
    if (!result.ok) throw Error("Client creation failed");
    expect(await prisma.client.findUnique({ where: { id: result.clientId } })).toMatchObject({ status: "ONBOARDING" });
    expect(await prisma.clientMembership.findFirst({ where: { clientId: result.clientId } })).toMatchObject({ staffUserId: "actor" });
    expect(await prisma.auditLog.findFirst({ where: { clientId: result.clientId, entityType: "Client" } })).toMatchObject({ staffUserId: "actor", action: "CREATE" });
    expect(await prisma.outboundEmail.count()).toBe(0);
  });
  it("lets the owner create the client, membership and audit together", async () => {
    await prisma.staffUser.update({ where: { id: "actor" }, data: { isSuperAdmin: true } });
    const result = await createClientFromOnboarding(request);
    expect(result.ok).toBe(true);
    expect(await prisma.client.count()).toBe(1);
    expect(await prisma.clientMembership.count()).toBe(1);
    expect(await prisma.auditLog.count({ where: { entityType: "Client" } })).toBe(1);
  });
  it("rolls back incomplete staff creation when the audit write fails", async () => {
    await prisma.$executeRawUnsafe(`CREATE FUNCTION owner_creation_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'creation audit failure'; END $$`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER owner_creation_fault BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION owner_creation_fault()`);
    await expect(createClientFromOnboarding(request)).rejects.toThrow("creation audit failure");
    expect(await prisma.client.count()).toBe(0);
    expect(await prisma.clientMembership.count()).toBe(0);
  });
  it.each(["signed-out", "inactive", "unknown"])("refuses client creation for %s identities", async (identity) => {
    if (identity === "signed-out") authMock.mockResolvedValue(null);
    if (identity === "inactive") await prisma.staffUser.update({ where: { id: "actor" }, data: { isActive: false } });
    if (identity === "unknown") authMock.mockResolvedValue({ user: { id: "unknown", email: "unknown@opendoors.test" } });
    await expect(createClientFromOnboarding(request)).rejects.toThrow();
    expect(await prisma.client.count()).toBe(0);
    expect(await prisma.clientMembership.count()).toBe(0);
  });
  it("enforces the domain policy through the base staff helper", async () => {
    vi.stubEnv("STAFF_EMAIL_DOMAINS", "different.test");
    await expect(requireStaffUser()).rejects.toThrow("STAFF_EMAIL_NOT_ALLOWED");
    await expect(createClientFromOnboarding(request)).rejects.toThrow("STAFF_EMAIL_NOT_ALLOWED");
    expect(await prisma.client.count()).toBe(0);
  });
});
