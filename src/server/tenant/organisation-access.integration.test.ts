import { afterAll, beforeEach, expect, it, vi } from "vitest";

import { prisma } from "@/lib/db";
import { OPENSDOORS_ORGANISATION_ID } from "@/lib/tenant/organisation";
import { closeIntegrationPool, resetIntegrationDatabase } from "@/test/integration/database";
import { clearClientReplies } from "@/app/(app)/clients/clear-client-replies-action";

import { canAccessClient, getAccessibleClientIds } from "./access";

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const OTHER_ORG = "org_fixture_agency";

beforeEach(async () => {
  vi.stubEnv("STAFF_EMAIL_DOMAINS", "");
  await resetIntegrationDatabase();
  await prisma.organisation.create({
    data: { id: OTHER_ORG, name: "Fixture Agency", slug: "fixture-agency", status: "ACTIVE" },
  });
  await prisma.client.createMany({
    data: [
      { id: "morson", name: "Morson", slug: "morson", status: "ACTIVE", organisationId: OPENSDOORS_ORGANISATION_ID },
      { id: "octavian", name: "Octavian", slug: "octavian", status: "ACTIVE", organisationId: OPENSDOORS_ORGANISATION_ID },
      { id: "bidlowai", name: "BidlowAI", slug: "bidlowai", status: "ACTIVE", organisationId: OPENSDOORS_ORGANISATION_ID },
      { id: "contoso", name: "Contoso", slug: "contoso", status: "ACTIVE", organisationId: OTHER_ORG },
      {
        id: "gone",
        name: "Gone",
        slug: "gone",
        status: "ARCHIVED",
        organisationId: OPENSDOORS_ORGANISATION_ID,
        deletedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ],
  });
  await prisma.staffUser.create({
    data: {
      id: "opensdoors-user",
      entraObjectId: "opensdoors-user",
      email: "ada@opensdoors.co.uk",
      role: "OPERATOR",
      isSuperAdmin: false,
    },
  });
  await prisma.staffUser.create({
    data: {
      id: "opensdoors-owner",
      entraObjectId: "opensdoors-owner",
      email: "owner@opensdoors.co.uk",
      role: "ADMIN",
      isSuperAdmin: true,
    },
  });
  await prisma.staffUser.create({
    data: {
      id: "other-user",
      entraObjectId: "other-user",
      email: "sam@fixture-agency.example",
      role: "OPERATOR",
    },
  });
  await prisma.staffUser.create({
    data: {
      id: "platform",
      entraObjectId: "platform",
      email: "greg@bidlow.co.uk",
      role: "ADMIN",
      isSuperAdmin: true,
      isPlatformAdmin: true,
    },
  });
  // The integration database attaches new staff to OpensDoors. Move the
  // fixture agency user across; the others stay where the trigger put them.
  await prisma.organisationMember.update({
    where: {
      organisationId_staffUserId: {
        organisationId: OPENSDOORS_ORGANISATION_ID,
        staffUserId: "other-user",
      },
    },
    data: { organisationId: OTHER_ORG, role: "USER" },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
  await closeIntegrationPool();
});

const opensDoors = { id: "opensdoors-user", role: "OPERATOR" as const };
const other = { id: "other-user", role: "OPERATOR" as const };
const platform = { id: "platform", role: "ADMIN" as const };

it("an OpensDoors user sees Morson, Octavian and BidlowAI, and not the other organisation", async () => {
  const ids = await getAccessibleClientIds(opensDoors);
  expect(ids.sort()).toEqual(["bidlowai", "morson", "octavian"]);
  expect(await canAccessClient(opensDoors, "contoso")).toBe(false);
  expect(await canAccessClient(opensDoors, "gone")).toBe(false);
});

it("the other organisation sees none of OpensDoors, and OpensDoors sees none of theirs", async () => {
  expect(await getAccessibleClientIds(other)).toEqual(["contoso"]);
  expect(await canAccessClient(other, "morson")).toBe(false);
  expect(await canAccessClient(other, "octavian")).toBe(false);
  expect(await canAccessClient(other, "bidlowai")).toBe(false);
  expect(await canAccessClient(opensDoors, "contoso")).toBe(false);
});

it("a platform admin stays in their own organisation until they enter another, and an OpensDoors flag does not cross it", async () => {
  expect((await getAccessibleClientIds(platform)).sort()).toEqual(["bidlowai", "morson", "octavian"]);
  expect(await canAccessClient(platform, "contoso")).toBe(false);
  await prisma.staffUser.update({
    where: { id: "opensdoors-owner" },
    data: { isPlatformAdmin: true },
  });
  expect(await getAccessibleClientIds({ id: "opensdoors-owner", role: "ADMIN" })).not.toContain("contoso");
});

it("an OpensDoors owner cannot clear another organisation's replies", async () => {
  authMock.mockResolvedValue({
    user: { id: "opensdoors-owner", email: "owner@opensdoors.co.uk", name: "Owner" },
  });
  await expect(clearClientReplies({ clientId: "contoso", confirmation: "Contoso" })).resolves.toEqual({
    ok: false,
    error: "Client not found.",
  });
  expect(await prisma.inboundReply.count()).toBe(0);
  await expect(clearClientReplies({ clientId: "morson", confirmation: "nope" })).resolves.toMatchObject({
    ok: false,
    error: expect.stringContaining("Morson"),
  });
});
