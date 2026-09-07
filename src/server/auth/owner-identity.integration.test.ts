import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetIntegrationDatabase, closeIntegrationPool } from "@/test/integration/database";
import { requireStaffUser, requireSuperAdmin } from "./staff";

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));

beforeEach(async () => {
  vi.stubEnv("STAFF_EMAIL_DOMAINS", "opendoors.test");
  vi.stubGlobal("fetch", vi.fn(() => { throw Error("External HTTP forbidden"); }));
  await resetIntegrationDatabase();
  await prisma.staffUser.create({ data: {
    id: "owner", entraObjectId: "owner-primary", email: "owner@opendoors.test",
    role: "ADMIN", isSuperAdmin: true, guestInvitationState: "ACCEPTED",
    graphInvitedUserObjectId: "owner-guest",
  } });
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals(); vi.unstubAllEnvs();
});
afterAll(async () => { await prisma.$disconnect(); await closeIntegrationPool(); });

it.each(["NONE", "PENDING", "ACCEPTED"] as const)("refuses owner email rebinding regardless of invitation state %s", async (guestInvitationState) => {
  await prisma.staffUser.update({ where: { id: "owner" }, data: { guestInvitationState } });
  authMock.mockResolvedValue({ user: { id: "different-identity", email: "owner@opendoors.test" } });
  await expect(requireSuperAdmin()).rejects.toThrow("Unauthorized");
  expect(await prisma.staffUser.findUnique({ where: { id: "owner" } })).toMatchObject({ entraObjectId: "owner-primary", isSuperAdmin: true, guestInvitationState });
  // The denied attempt must not break the owner's next legitimate sign-in.
  authMock.mockResolvedValue({ user: { id: "owner-primary", email: "owner@opendoors.test" } });
  expect(await requireSuperAdmin()).toMatchObject({ id: "owner", entraObjectId: "owner-primary" });
});

it("accepts the explicitly recorded guest identity without replacing the primary owner identity", async () => {
  authMock.mockResolvedValue({ user: { id: "owner-guest", email: "guest-upn@opendoors.test" } });
  expect(await requireSuperAdmin()).toMatchObject({ id: "owner", entraObjectId: "owner-primary" });
  expect(await prisma.staffUser.findUnique({ where: { id: "owner" } })).toMatchObject({ entraObjectId: "owner-primary", email: "owner@opendoors.test" });
});

it("still refuses an inactive owner using the recorded guest identity", async () => {
  await prisma.staffUser.update({ where: { id: "owner" }, data: { isActive: false } });
  authMock.mockResolvedValue({ user: { id: "owner-guest", email: "owner@opendoors.test" } });
  await expect(requireSuperAdmin()).rejects.toThrow("STAFF_INACTIVE");
});

it("preserves ordinary staff first-login binding without granting ownership", async () => {
  await prisma.staffUser.create({ data: { id: "staff", entraObjectId: "placeholder", email: "staff@opendoors.test", guestInvitationState: "PENDING" } });
  authMock.mockResolvedValue({ user: { id: "staff-primary", email: "staff@opendoors.test" } });
  expect(await requireStaffUser()).toMatchObject({ id: "staff", entraObjectId: "staff-primary", guestInvitationState: "ACCEPTED", isSuperAdmin: false });
  await expect(requireSuperAdmin()).rejects.toThrow("SUPER_ADMIN_ONLY");
});
