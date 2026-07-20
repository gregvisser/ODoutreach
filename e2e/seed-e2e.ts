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
  E2E_CONTACT,
  E2E_OUTBOUND_EMAIL,
  E2E_STAFF,
  E2E_SUPER_ADMIN,
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
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

seedE2eFixtures(process.env.E2E_DATABASE_URL).catch((error: unknown) => {
  console.error("e2e fixture seed failed:", error);
  process.exit(1);
});
