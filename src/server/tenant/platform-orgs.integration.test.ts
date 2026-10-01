import { afterAll, beforeEach, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { OPENSDOORS_ORGANISATION_ID, resolveOrganisationFeatureFlags } from "@/lib/tenant/organisation";
import { closeIntegrationPool, resetIntegrationDatabase } from "@/test/integration/database";

import {
  createOrganisationRecord,
  provisionPendingOrganisationMember,
  setOrganisationStatus,
  updateOrganisationFlags,
  updateOrganisationHostname,
} from "./platform-orgs";

beforeEach(async () => {
  await resetIntegrationDatabase();
  await prisma.staffUser.create({
    data: {
      id: "platform-inviter",
      entraObjectId: "platform-inviter",
      email: "greg@bidlow.co.uk",
      role: "ADMIN",
      isSuperAdmin: true,
      isPlatformAdmin: true,
    },
  });
});

afterAll(async () => {
  await closeIntegrationPool();
});

it("creates an organisation, stores flags, suspends it, and provisions an owner who is not a platform admin", async () => {
  const created = await createOrganisationRecord({ name: "Northwind", slug: " Northwind " });
  expect(created.ok).toBe(true);
  if (!created.ok) return;

  const organisation = await prisma.organisation.findUniqueOrThrow({ where: { id: created.organisationId } });
  expect(organisation.slug).toBe("northwind");
  expect(organisation.id).not.toBe(OPENSDOORS_ORGANISATION_ID);
  expect(organisation.status).toBe("ACTIVE");
  expect(resolveOrganisationFeatureFlags(organisation.featureFlags).universe).toBe(true);

  const flagged = await updateOrganisationFlags(organisation.id, {
    universe: false,
    unknownSwitch: true,
    aiCampaigns: "off",
  });
  expect(flagged.ok).toBe(true);
  const stored = await prisma.organisation.findUniqueOrThrow({ where: { id: organisation.id } });
  const flags = resolveOrganisationFeatureFlags(stored.featureFlags);
  expect(flags.universe).toBe(false);
  expect(flags.aiCampaigns).toBe(true);
  expect(stored.featureFlags).not.toHaveProperty("unknownSwitch");

  const suspended = await setOrganisationStatus(organisation.id, "SUSPENDED");
  expect(suspended.ok).toBe(true);
  expect(
    (await prisma.organisation.findUniqueOrThrow({ where: { id: organisation.id } })).status,
  ).toBe("SUSPENDED");
  expect(
    (await prisma.organisation.findUniqueOrThrow({ where: { id: OPENSDOORS_ORGANISATION_ID } })).status,
  ).toBe("ACTIVE");

  const provisioned = await provisionPendingOrganisationMember({
    organisationId: organisation.id,
    email: " Ada@Northwind.example ",
    staffRole: "ADMIN",
    membershipRole: "OWNER",
    invitedById: "platform-inviter",
  });
  expect(provisioned.ok).toBe(true);
  if (!provisioned.ok) return;

  const member = await prisma.staffUser.findUniqueOrThrow({
    where: { id: provisioned.staffUserId },
    include: { organisationMemberships: true },
  });
  expect(member.email).toBe("ada@northwind.example");
  expect(member.role).toBe("ADMIN");
  expect(member.isPlatformAdmin).toBe(false);
  expect(member.isSuperAdmin).toBe(false);
  expect(member.graphInvitationId).toBeNull();
  expect(member.organisationMemberships).toHaveLength(1);
  expect(member.organisationMemberships[0]?.organisationId).toBe(organisation.id);
  expect(member.organisationMemberships[0]?.role).toBe("OWNER");

  const duplicate = await createOrganisationRecord({ name: "Other", slug: "northwind" });
  expect(duplicate).toEqual({ ok: false, error: "An organisation with that slug already exists." });

  const invalid = await createOrganisationRecord({ name: "Bad", slug: "not a slug" });
  expect(invalid.ok).toBe(false);
});

it("stores a hostname on one organisation and leaves OpensDoors on its own host", async () => {
  const created = await createOrganisationRecord({ name: "Northwind", slug: "northwind" });
  expect(created.ok).toBe(true);
  if (!created.ok) return;

  const saved = await updateOrganisationHostname(created.organisationId, "northwind.bidlow.co.uk");
  expect(saved).toEqual({ ok: true, organisationId: created.organisationId });

  const opensDoors = await prisma.organisation.findUniqueOrThrow({
    where: { id: OPENSDOORS_ORGANISATION_ID },
  });
  expect(opensDoors.hostname).not.toBe("northwind.bidlow.co.uk");

  const taken = await updateOrganisationHostname(OPENSDOORS_ORGANISATION_ID, "northwind.bidlow.co.uk");
  expect(taken).toEqual({ ok: false, error: "That hostname is already used." });

  const cleared = await updateOrganisationHostname(created.organisationId, null);
  expect(cleared.ok).toBe(true);
  expect(
    (await prisma.organisation.findUniqueOrThrow({ where: { id: created.organisationId } })).hostname,
  ).toBeNull();
  expect(
    (await prisma.organisation.findUniqueOrThrow({ where: { id: OPENSDOORS_ORGANISATION_ID } })).hostname,
  ).toBe(opensDoors.hostname);
});
