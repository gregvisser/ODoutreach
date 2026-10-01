import { afterAll, beforeEach, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { OPENSDOORS_ORGANISATION_ID } from "@/lib/tenant/organisation";
import { closeIntegrationPool, resetIntegrationDatabase } from "@/test/integration/database";
import { upsertContactUniverseAndRecordSource } from "@/server/contacts/contact-universe";
import { findCooldownOutboundRows } from "@/server/email/outbound/organisation-cooldown";
import { isInternalSeedAddress } from "@/server/internal-seed/seed-allowlist";
import { getAiSpendReport } from "@/server/queries/ai-spend";
import { listContactUniversesForTable } from "@/server/queries/contact-universe-list";
import { supportTicketWhere } from "@/server/support/ticket-scope";

const OTHER_ORG = "org_fixture_agency";

beforeEach(async () => {
  delete process.env.INTERNAL_SEED_ALLOWLIST_ENABLED;
  await resetIntegrationDatabase();
  await prisma.organisation.create({
    data: { id: OTHER_ORG, name: "Fixture Agency", slug: "fixture-agency", status: "ACTIVE" },
  });
  await prisma.client.createMany({
    data: [
      { id: "morson", name: "Morson", slug: "morson", status: "ACTIVE", organisationId: OPENSDOORS_ORGANISATION_ID },
      { id: "octavian", name: "Octavian", slug: "octavian", status: "ACTIVE", organisationId: OPENSDOORS_ORGANISATION_ID },
      { id: "contoso", name: "Contoso", slug: "contoso", status: "ACTIVE", organisationId: OTHER_ORG },
    ],
  });
});

afterAll(async () => {
  delete process.env.INTERNAL_SEED_ALLOWLIST_ENABLED;
  await prisma.$disconnect();
  await closeIntegrationPool();
});

it("shares one universe warehouse across OpensDoors clients and not with another organisation", async () => {
  const first = await upsertContactUniverseAndRecordSource(prisma, {
    emailNormalized: "ada@example.test",
    firstSeenClientId: "morson",
    firstSeenSourceType: "CSV_IMPORT",
  });
  const sibling = await upsertContactUniverseAndRecordSource(prisma, {
    emailNormalized: "Ada@Example.test",
    firstSeenClientId: "octavian",
    firstSeenSourceType: "ROCKETREACH",
  });
  const other = await upsertContactUniverseAndRecordSource(prisma, {
    emailNormalized: "ada@example.test",
    firstSeenClientId: "contoso",
    firstSeenSourceType: "CSV_IMPORT",
  });

  expect(sibling).toEqual({ universeId: first.universeId, created: false });
  expect(other.created).toBe(true);
  expect(other.universeId).not.toBe(first.universeId);

  const opensDoors = await listContactUniversesForTable(
    { q: "ada@example.test" },
    { kind: "organisation", organisationId: OPENSDOORS_ORGANISATION_ID },
  );
  const fixture = await listContactUniversesForTable(
    { q: "ada@example.test" },
    { kind: "organisation", organisationId: OTHER_ORG },
  );
  expect(opensDoors.rows.map((row) => row.id)).toEqual([first.universeId]);
  expect(fixture.rows.map((row) => row.id)).toEqual([other.universeId]);
});

it("keeps the 10-day cooldown inside the organisation", async () => {
  const sentAt = new Date();
  await prisma.outboundEmail.create({
    data: {
      id: "morson-send",
      clientId: "morson",
      toEmail: "prospect@example.test",
      status: "SENT",
      sentAt,
      queuedAt: sentAt,
    },
  });
  const since = new Date(sentAt.getTime() - 10 * 24 * 60 * 60 * 1000);
  const opensDoors = await findCooldownOutboundRows({
    clientId: "octavian",
    emails: ["prospect@example.test"],
    sentSince: since,
  });
  const other = await findCooldownOutboundRows({
    clientId: "contoso",
    emails: ["prospect@example.test"],
    sentSince: since,
  });
  expect(opensDoors.map((row) => row.id)).toEqual(["morson-send"]);
  expect(other).toEqual([]);
});

it("does not treat another organisation's seed address as exempt", async () => {
  process.env.INTERNAL_SEED_ALLOWLIST_ENABLED = "true";
  await prisma.internalSeedAddress.create({
    data: {
      email: "seed@opensdoors.co.uk",
      organisationId: OPENSDOORS_ORGANISATION_ID,
      isActive: true,
    },
  });
  expect(await isInternalSeedAddress("seed@opensdoors.co.uk", OPENSDOORS_ORGANISATION_ID)).toBe(true);
  expect(await isInternalSeedAddress("seed@opensdoors.co.uk", OTHER_ORG)).toBe(false);
});

it("keeps support tickets and stamps audit and AI usage on the writer's organisation", async () => {
  await prisma.supportTicket.create({
    data: {
      id: "ticket-od",
      organisationId: OPENSDOORS_ORGANISATION_ID,
      title: "OpensDoors ticket",
      description: "Visible to OpensDoors",
      reporterEmail: "ada@opensdoors.co.uk",
    },
  });
  await prisma.supportTicket.create({
    data: {
      id: "ticket-other",
      organisationId: OTHER_ORG,
      title: "Fixture ticket",
      description: "Not visible to OpensDoors",
      reporterEmail: "sam@fixture-agency.example",
    },
  });
  const visible = await prisma.supportTicket.findMany({
    where: supportTicketWhere({ kind: "organisation", organisationId: OPENSDOORS_ORGANISATION_ID }),
    select: { id: true },
  });
  expect(visible.map((row) => row.id)).toEqual(["ticket-od"]);

  await prisma.auditLog.create({
    data: { clientId: "contoso", action: "UPDATE", entityType: "Client", entityId: "contoso" },
  });
  await expect(
    prisma.auditLog.findFirstOrThrow({ where: { entityId: "contoso" } }),
  ).resolves.toMatchObject({ organisationId: OTHER_ORG });

  await prisma.aiUsageEvent.create({
    data: {
      clientId: "morson",
      clientSlugAtCall: "morson",
      feature: "REPLY_CLASSIFICATION",
      status: "OK",
      model: "grok-test",
      rateVersion: "test",
    },
  });
  await prisma.aiUsageEvent.create({
    data: {
      clientSlugAtCall: "bidlowai",
      feature: "TRAINING_ASSISTANT",
      status: "OK",
      model: "grok-test",
      rateVersion: "test",
    },
  });
  const now = new Date();
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const opensDoors = await getAiSpendReport(month, now, OPENSDOORS_ORGANISATION_ID);
  const other = await getAiSpendReport(month, now, OTHER_ORG);
  const platform = await getAiSpendReport(month, now, undefined);
  expect(opensDoors.summary.clients.map((row) => row.clientId)).toEqual(["morson"]);
  expect(other.summary.clients).toEqual([]);
  expect(platform.summary.totals.totalCalls).toBe(2);
  expect(opensDoors.summary.totals.totalCalls).toBe(1);
});
