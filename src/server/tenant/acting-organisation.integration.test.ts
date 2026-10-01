import { afterAll, beforeEach, expect, it, vi } from "vitest";

import { prisma } from "@/lib/db";
import { ACTING_ORGANISATION_COOKIE, PLATFORM_ADMIN_ENTERED_OP } from "@/lib/tenant/acting-organisation";
import { OPENSDOORS_ORGANISATION_ID } from "@/lib/tenant/organisation";
import { closeIntegrationPool, resetIntegrationDatabase } from "@/test/integration/database";
import { createClientFromOnboarding } from "@/app/(app)/clients/actions";

import { enterOrganisation } from "./acting-organisation";
import { canAccessClient, getAccessibleClientIds } from "./access";
import { inviteStaffIntoOrganisation } from "./invite-organisation-staff";

const cookieStore = vi.hoisted(() => new Map<string, string>());
const authMock = vi.hoisted(() => vi.fn());

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieStore.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set: (name: string, value: string) => {
      cookieStore.set(name, value);
    },
  }),
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const PAPAYA = "org_papaya";

beforeEach(async () => {
  cookieStore.clear();
  vi.stubEnv("STAFF_EMAIL_DOMAINS", "");
  authMock.mockReset();
  await resetIntegrationDatabase();
  await prisma.organisation.create({
    data: { id: PAPAYA, name: "Papaya UK", slug: "papaya-uk", status: "ACTIVE" },
  });
  await prisma.client.createMany({
    data: [
      { id: "morson", name: "Morson", slug: "morson", status: "ACTIVE", organisationId: OPENSDOORS_ORGANISATION_ID },
      { id: "papaya-client", name: "Papaya Client", slug: "papaya-client", status: "ACTIVE", organisationId: PAPAYA },
    ],
  });
  await prisma.staffUser.create({
    data: {
      id: "greg",
      entraObjectId: "greg-oid",
      email: "greg@bidlow.co.uk",
      role: "ADMIN",
      isSuperAdmin: true,
      isPlatformAdmin: true,
    },
  });
  await prisma.staffUser.create({
    data: {
      id: "ada",
      entraObjectId: "ada-oid",
      email: "ada@opensdoors.co.uk",
      role: "OPERATOR",
    },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
  await closeIntegrationPool();
});

it("adds Greg to Papaya UK without a second account or a Microsoft invitation", async () => {
  const added = await inviteStaffIntoOrganisation({
    actorStaffUserId: "greg",
    organisationId: PAPAYA,
    email: "greg@bidlow.co.uk",
    staffRole: "ADMIN",
    membershipRole: "OWNER",
  });
  expect(added).toMatchObject({ ok: true });
  if (!added.ok) return;

  const people = await prisma.staffUser.findMany({ where: { email: "greg@bidlow.co.uk" } });
  expect(people).toHaveLength(1);
  expect(people[0]).toMatchObject({
    isPlatformAdmin: true,
    isSuperAdmin: true,
    role: "ADMIN",
  });

  const memberships = await prisma.organisationMember.findMany({
    where: { staffUserId: "greg" },
    orderBy: { organisationId: "asc" },
  });
  expect(memberships.map((row) => row.organisationId).sort()).toEqual([OPENSDOORS_ORGANISATION_ID, PAPAYA].sort());
  expect(memberships.find((row) => row.organisationId === PAPAYA)?.role).toBe("OWNER");

  const again = await inviteStaffIntoOrganisation({
    actorStaffUserId: "greg",
    organisationId: PAPAYA,
    email: "Greg@bidlow.co.uk",
    staffRole: "ADMIN",
    membershipRole: "OWNER",
  });
  expect(again).toEqual({ ok: false, error: "This person is already in this organisation." });
});

it("a platform admin who enters Papaya sees only Papaya, and the entry is audited", async () => {
  const entered = await enterOrganisation({
    staffUserId: "greg",
    email: "greg@bidlow.co.uk",
    isPlatformAdmin: true,
    organisationId: PAPAYA,
  });
  expect(entered).toEqual({ ok: true });
  expect(cookieStore.get(ACTING_ORGANISATION_COOKIE)).toBe(PAPAYA);

  const ids = await getAccessibleClientIds({ id: "greg", role: "ADMIN" });
  expect(ids).toEqual(["papaya-client"]);
  expect(await canAccessClient({ id: "greg", role: "ADMIN" }, "morson")).toBe(false);

  const audit = await prisma.auditLog.findFirst({
    where: { entityType: "Organisation", entityId: PAPAYA },
  });
  expect(audit).toMatchObject({
    organisationId: PAPAYA,
    staffUserId: "greg",
    action: "LOGIN",
    metadata: { op: PLATFORM_ADMIN_ENTERED_OP, organisationSlug: "papaya-uk" },
  });
});

it("a member of OpensDoors cannot enter Papaya or see its client", async () => {
  const entered = await enterOrganisation({
    staffUserId: "ada",
    email: "ada@opensdoors.co.uk",
    isPlatformAdmin: false,
    organisationId: PAPAYA,
  });
  expect(entered).toEqual({ ok: false, error: "You are not in that organisation." });
  expect(cookieStore.has(ACTING_ORGANISATION_COOKIE)).toBe(false);

  cookieStore.set(ACTING_ORGANISATION_COOKIE, PAPAYA);
  expect(await getAccessibleClientIds({ id: "ada", role: "OPERATOR" })).toEqual(["morson"]);
  expect(await canAccessClient({ id: "ada", role: "OPERATOR" }, "papaya-client")).toBe(false);
});

it("a new client is created in the organisation the person has entered", async () => {
  authMock.mockResolvedValue({
    user: { id: "greg-oid", email: "greg@bidlow.co.uk", name: "Greg" },
  });
  cookieStore.set(ACTING_ORGANISATION_COOKIE, PAPAYA);

  const created = await createClientFromOnboarding({ name: "Papaya Workspace", slug: "papaya-workspace" });
  expect(created.ok).toBe(true);
  if (!created.ok) return;
  const client = await prisma.client.findUniqueOrThrow({ where: { id: created.clientId } });
  expect(client.organisationId).toBe(PAPAYA);
  expect(await canAccessClient({ id: "ada", role: "OPERATOR" }, created.clientId)).toBe(false);
});

it("an audit row for someone in two organisations does not guess and does not throw", async () => {
  await prisma.organisationMember.create({
    data: { organisationId: PAPAYA, staffUserId: "greg", role: "OWNER" },
  });
  const ambiguous = await prisma.auditLog.create({
    data: {
      staffUserId: "greg",
      action: "UPDATE",
      entityType: "Synthetic",
      metadata: { kind: "ambiguous" },
    },
  });
  expect(ambiguous.organisationId).toBeNull();

  const sole = await prisma.auditLog.create({
    data: {
      staffUserId: "ada",
      action: "UPDATE",
      entityType: "Synthetic",
      metadata: { kind: "sole" },
    },
  });
  expect(sole.organisationId).toBe(OPENSDOORS_ORGANISATION_ID);
});
