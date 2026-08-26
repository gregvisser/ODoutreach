/**
 * Seeds the deterministic fixtures the authenticated e2e journeys assert against.
 *
 * Run as its own `tsx` process (see `e2e/global-setup.ts`), not imported by
 * Playwright: the generated Prisma client is ESM and Playwright's TypeScript
 * loader is CommonJS, so importing it from a global-setup module fails on
 * `import.meta`. This mirrors how `prisma/seed.ts` is already run.
 *
 * SAFETY: destructive by design — it upserts rows at fixed ids.
 * `assertSafeTestDatabase` refuses anything that is not an obvious local/CI
 * throwaway database, so these fixtures can never reach real client data.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import { PrismaClient } from "../src/generated/prisma/client";
import {
  E2E_CLIENT,
  E2E_CLIENT_B,
  E2E_CONTACT,
  E2E_CONTACT_B,
  E2E_MEMBER_A,
  E2E_MEMBER_B,
  E2E_OUTBOUND_EMAIL,
  E2E_STAFF,
  E2E_SUPER_ADMIN,
  E2E_SUPPRESSION,
  e2eSuppressedEmail,
} from "./fixtures";
import { assertSafeTestDatabase } from "./safe-database";

/**
 * Upserts the fixture graph: two staff personas, one workspace, one contact and
 * one already-SENT outbound email. Idempotent — safe to run before every suite.
 */
async function seedE2eFixtures(databaseUrl: string | undefined): Promise<void> {
  // Throws with an explicit message when unset — never falls back to DATABASE_URL.
  const safeUrl = assertSafeTestDatabase(databaseUrl);

  const pool = new Pool({ connectionString: safeUrl.toString() });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    await prisma.staffUser.upsert({
      where: { entraObjectId: E2E_SUPER_ADMIN.entraObjectId },
      create: {
        entraObjectId: E2E_SUPER_ADMIN.entraObjectId,
        email: E2E_SUPER_ADMIN.email,
        displayName: E2E_SUPER_ADMIN.displayName,
        role: "ADMIN",
        isActive: true,
        isSuperAdmin: true,
      },
      update: { isActive: true, isSuperAdmin: true, role: "ADMIN" },
    });

    await prisma.staffUser.upsert({
      where: { entraObjectId: E2E_STAFF.entraObjectId },
      create: {
        entraObjectId: E2E_STAFF.entraObjectId,
        email: E2E_STAFF.email,
        displayName: E2E_STAFF.displayName,
        role: "OPERATOR",
        isActive: true,
        isSuperAdmin: false,
      },
      update: { isActive: true, isSuperAdmin: false, role: "OPERATOR" },
    });

    await prisma.client.upsert({
      where: { id: E2E_CLIENT.id },
      create: {
        id: E2E_CLIENT.id,
        name: E2E_CLIENT.name,
        slug: E2E_CLIENT.slug,
        status: "ACTIVE",
      },
      update: { name: E2E_CLIENT.name, status: "ACTIVE", deletedAt: null },
    });

    await prisma.contact.upsert({
      where: { id: E2E_CONTACT.id },
      create: {
        id: E2E_CONTACT.id,
        clientId: E2E_CLIENT.id,
        email: E2E_CONTACT.email,
        fullName: E2E_CONTACT.fullName,
        emailDomain: "example.test",
      },
      update: { email: E2E_CONTACT.email, isSuppressed: false },
    });

    await prisma.outboundEmail.upsert({
      where: { id: E2E_OUTBOUND_EMAIL.id },
      create: {
        id: E2E_OUTBOUND_EMAIL.id,
        clientId: E2E_CLIENT.id,
        contactId: E2E_CONTACT.id,
        toEmail: E2E_OUTBOUND_EMAIL.toEmail,
        toDomain: "example.test",
        subject: E2E_OUTBOUND_EMAIL.subject,
        fromAddress: "sender@example.test",
        providerName: "mock",
        status: "SENT",
        sentAt: new Date("2026-01-01T09:00:00.000Z"),
        queuedAt: new Date("2026-01-01T08:59:00.000Z"),
      },
      update: { status: "SENT", subject: E2E_OUTBOUND_EMAIL.subject },
    });

    // ---- cross-tenant isolation fixtures (BC-01) -----------------------
    // A second workspace, and one staff member scoped to each. Membership is
    // what getAccessibleClientIds reads, so without these rows the isolation
    // path is never exercised by a test.
    await prisma.client.upsert({
      where: { id: E2E_CLIENT_B.id },
      create: {
        id: E2E_CLIENT_B.id,
        name: E2E_CLIENT_B.name,
        slug: E2E_CLIENT_B.slug,
        status: "ACTIVE",
      },
      update: { name: E2E_CLIENT_B.name, status: "ACTIVE", deletedAt: null },
    });

    for (const [person, clientId] of [
      [E2E_MEMBER_A, E2E_CLIENT.id],
      [E2E_MEMBER_B, E2E_CLIENT_B.id],
    ] as const) {
      const staff = await prisma.staffUser.upsert({
        where: { entraObjectId: person.entraObjectId },
        create: {
          entraObjectId: person.entraObjectId,
          email: person.email,
          displayName: person.displayName,
          isActive: true,
          isSuperAdmin: false,
          role: "OPERATOR",
        },
        update: { isActive: true, isSuperAdmin: false, role: "OPERATOR" },
      });

      await prisma.clientMembership.upsert({
        where: { staffUserId_clientId: { staffUserId: staff.id, clientId } },
        create: { staffUserId: staff.id, clientId, role: "CONTRIBUTOR" },
        update: { role: "CONTRIBUTOR" },
      });
    }

    // Client B needs a record of its own, so the test proves each side sees its
    // own data and not the other, rather than merely seeing nothing.
    await prisma.contact.upsert({
      where: { id: E2E_CONTACT_B.id },
      create: {
        id: E2E_CONTACT_B.id,
        clientId: E2E_CLIENT_B.id,
        email: E2E_CONTACT_B.email,
        fullName: E2E_CONTACT_B.fullName,
        emailDomain: "example.test",
      },
      update: { email: E2E_CONTACT_B.email, isSuppressed: false },
    });

    /**
     * Enough blocked addresses to exceed one page of /suppression, so the
     * "Showing 200 of 200 while there are really 30,229" defect has something
     * to reproduce against. Domains stay under one page so the other branch of
     * the count sentence ("Showing all 3") is exercised too.
     */
    await prisma.suppressionSource.upsert({
      where: { id: E2E_SUPPRESSION.sourceId },
      create: {
        id: E2E_SUPPRESSION.sourceId,
        clientId: E2E_CLIENT.id,
        kind: "EMAIL",
        label: "E2E blocked addresses",
        syncStatus: "SUCCESS",
      },
      update: { syncStatus: "SUCCESS" },
    });
    await prisma.suppressionSource.upsert({
      where: { id: E2E_SUPPRESSION.domainSourceId },
      create: {
        id: E2E_SUPPRESSION.domainSourceId,
        clientId: E2E_CLIENT.id,
        kind: "DOMAIN",
        label: "E2E blocked domains",
        syncStatus: "SUCCESS",
      },
      update: { syncStatus: "SUCCESS" },
    });

    await prisma.suppressedEmail.createMany({
      data: Array.from({ length: E2E_SUPPRESSION.emailCount }, (_, i) => ({
        clientId: E2E_CLIENT.id,
        sourceId: E2E_SUPPRESSION.sourceId,
        email: e2eSuppressedEmail(i),
      })),
      skipDuplicates: true,
    });
    await prisma.suppressedDomain.createMany({
      data: Array.from({ length: E2E_SUPPRESSION.domainCount }, (_, i) => ({
        clientId: E2E_CLIENT.id,
        sourceId: E2E_SUPPRESSION.domainSourceId,
        domain: `blocked-${i}.e2e-suppression.test`,
      })),
      skipDuplicates: true,
    });
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

seedE2eFixtures(process.env.E2E_DATABASE_URL).catch((error: unknown) => {
  console.error("e2e fixture seed failed:", error);
  process.exit(1);
});
