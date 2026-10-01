import { afterAll, beforeEach, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { OPENSDOORS_ORGANISATION_ID } from "@/lib/tenant/organisation";
import { closeIntegrationPool, resetIntegrationDatabase } from "@/test/integration/database";

import { createOrganisationRecord, updateOrganisationFlags } from "./platform-orgs";
import {
  decideRocketReachSpend,
  loadRocketReachCeiling,
  organisationFeatureEnabledById,
} from "./feature-gate";

beforeEach(async () => {
  await resetIntegrationDatabase();
});

afterAll(async () => {
  await closeIntegrationPool();
});

it("keeps OpensDoors features on and stops another organisation at its switches and credit allowance", async () => {
  expect(await organisationFeatureEnabledById(OPENSDOORS_ORGANISATION_ID, "universe", true)).toBe(true);
  expect(await organisationFeatureEnabledById(OPENSDOORS_ORGANISATION_ID, "aiCampaigns", false)).toBe(false);

  const created = await createOrganisationRecord({ name: "Northwind", slug: "northwind" });
  expect(created.ok).toBe(true);
  if (!created.ok) return;
  await updateOrganisationFlags(created.organisationId, { universe: false, rocketReachBuying: true });
  expect(await organisationFeatureEnabledById(created.organisationId, "universe", true)).toBe(false);
  expect(await organisationFeatureEnabledById(created.organisationId, "humanSending", true)).toBe(true);

  await prisma.client.create({
    data: {
      id: "northwind-client",
      name: "Northwind",
      slug: "northwind-client",
      status: "ACTIVE",
      organisationId: created.organisationId,
    },
  });
  await prisma.organisation.update({
    where: { id: created.organisationId },
    data: { rocketReachCreditAllowance: 2, rocketReachCreditsUsed: 2 },
  });

  const ceiling = await loadRocketReachCeiling("northwind-client");
  expect(ceiling.enforced).toBe(true);
  expect(ceiling.buyingEnabled).toBe(true);
  expect(
    decideRocketReachSpend({ ceiling, balance: 500, requested: 1 }),
  ).toMatchObject({ allowed: 0 });

  const opensDoors = await loadRocketReachCeiling("missing");
  expect(opensDoors.buyingEnabled).toBe(false);
});
