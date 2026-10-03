import { afterAll, beforeEach, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { OPENSDOORS_ORGANISATION_ID } from "@/lib/tenant/organisation";
import { closeIntegrationPool, resetIntegrationDatabase } from "@/test/integration/database";

import { createOrganisationRecord, updateOrganisationFlags } from "./platform-orgs";
import {
  decideRocketReachSpend,
  loadRocketReachCeiling,
  organisationAiCapBlocks,
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

it("pauses AI for one organisation at its $50 monthly cap, counting only this UTC month, without touching another", async () => {
  const created = await createOrganisationRecord({ name: "Capped Co", slug: "capped-co" });
  expect(created.ok).toBe(true);
  if (!created.ok) return;
  const capped = await prisma.organisation.findUniqueOrThrow({
    where: { id: created.organisationId },
    select: { aiSpendCapMicroUsd: true },
  });
  // New organisations get the $50 default from the column default.
  expect(capped.aiSpendCapMicroUsd).toBe(50_000_000);
  await prisma.organisation.update({
    where: { id: OPENSDOORS_ORGANISATION_ID },
    data: { aiSpendCapMicroUsd: 50_000_000 },
  });

  const now = new Date("2026-10-20T12:00:00Z");
  const row = (organisationId: string, costMicroUsd: number, createdAt: Date) => ({
    organisationId,
    clientSlugAtCall: "x",
    feature: "SEQUENCE_DRAFTING" as const,
    status: "OK" as const,
    model: "grok-4.7",
    costMicroUsd,
    rateVersion: "test",
    createdAt,
  });
  await prisma.aiUsageEvent.createMany({
    data: [
      // Last month's spend does not count against this month.
      row(created.organisationId, 60_000_000, new Date("2026-09-30T23:59:59Z")),
      row(created.organisationId, 49_000_000, new Date("2026-10-01T00:00:00Z")),
      row(OPENSDOORS_ORGANISATION_ID, 1_000_000, new Date("2026-10-05T00:00:00Z")),
    ],
  });
  expect(await organisationAiCapBlocks({ clientId: null, organisationId: created.organisationId, now })).toBe(false);

  await prisma.aiUsageEvent.create({ data: row(created.organisationId, 1_000_000, new Date("2026-10-19T00:00:00Z")) });
  expect(await organisationAiCapBlocks({ clientId: null, organisationId: created.organisationId, now })).toBe(true);
  // Another organisation is not affected.
  expect(await organisationAiCapBlocks({ clientId: null, organisationId: OPENSDOORS_ORGANISATION_ID, now })).toBe(false);
  // It resumes on the 1st of next month.
  expect(
    await organisationAiCapBlocks({
      clientId: null,
      organisationId: created.organisationId,
      now: new Date("2026-11-01T00:00:01Z"),
    }),
  ).toBe(false);
});
