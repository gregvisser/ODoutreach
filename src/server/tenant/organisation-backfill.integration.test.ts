import { readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import {
  OPENSDOORS_ORGANISATION_ID,
  OPENSDOORS_ORGANISATION_SLUG,
} from "@/lib/tenant/organisation";
import { closeIntegrationPool, integrationDatabaseUrl, resetIntegrationDatabase } from "@/test/integration/database";
import { Pool } from "pg";

afterAll(async () => {
  await prisma.$disconnect();
  await closeIntegrationPool();
});

it("keeps a client created without an organisation on OpensDoors", async () => {
  await resetIntegrationDatabase();
  const client = await prisma.client.create({
    data: { name: "Morson", slug: "morson-backfill" },
  });
  expect(client.organisationId).toBe(OPENSDOORS_ORGANISATION_ID);
  const organisation = await prisma.organisation.findUniqueOrThrow({
    where: { id: OPENSDOORS_ORGANISATION_ID },
  });
  expect(organisation.slug).toBe(OPENSDOORS_ORGANISATION_SLUG);
  expect(organisation.name).toBe("OpensDoors");
});

it("backfills staff onto OpensDoors and can be applied twice", async () => {
  await resetIntegrationDatabase();
  const owner = await prisma.staffUser.create({
    data: {
      entraObjectId: "greg-oid",
      email: "greg@bidlow.co.uk",
      role: "ADMIN",
      isSuperAdmin: true,
      isPlatformAdmin: false,
    },
  });
  const operator = await prisma.staffUser.create({
    data: {
      entraObjectId: "ada-oid",
      email: "ada@opensdoors.co.uk",
      role: "OPERATOR",
      isSuperAdmin: false,
    },
  });

  const sql = readFileSync(
    path.join(process.cwd(), "prisma/migrations/20261001130000_organisation_model/migration.sql"),
    "utf8",
  );
  const pool = new Pool({ connectionString: integrationDatabaseUrl(), max: 1 });
  try {
    await pool.query(sql);
    await pool.query(sql);
  } finally {
    await pool.end();
  }

  expect(await prisma.organisation.count({ where: { slug: OPENSDOORS_ORGANISATION_SLUG } })).toBe(1);
  const members = await prisma.organisationMember.findMany({
    orderBy: { staffUserId: "asc" },
  });
  expect(members).toHaveLength(2);
  expect(members).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ staffUserId: owner.id, role: "OWNER", organisationId: OPENSDOORS_ORGANISATION_ID }),
      expect.objectContaining({ staffUserId: operator.id, role: "USER", organisationId: OPENSDOORS_ORGANISATION_ID }),
    ]),
  );
  expect(
    (await prisma.staffUser.findUniqueOrThrow({ where: { id: owner.id } })).isPlatformAdmin,
  ).toBe(true);
  expect(
    (await prisma.staffUser.findUniqueOrThrow({ where: { id: operator.id } })).isPlatformAdmin,
  ).toBe(false);
  expect(await prisma.client.count()).toBe(0);
});
