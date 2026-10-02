import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import { enforceTenantOperation } from "@/lib/db-tenant-guard";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pgPool: Pool | undefined;
};

function createPrismaClient(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  // Explicit pool settings. `max` is tunable via PG_POOL_MAX so the pool
  // can be sized for the DB tier (Azure Postgres flexible B-tier allows
  // ~50 connections) without a code change; the default (10) matches the
  // pg library default. connectionTimeoutMillis makes a saturated pool
  // fail fast instead of hanging a request, and idleTimeoutMillis recycles
  // idle connections.
  const poolMax = Number.parseInt(process.env.PG_POOL_MAX ?? "", 10);
  const pool =
    globalForPrisma.pgPool ??
    new Pool({
      connectionString: url,
      max: Number.isFinite(poolMax) && poolMax > 0 ? poolMax : 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.pgPool = pool;
  }
  const adapter = new PrismaPg(pool);
  const base = new PrismaClient({ adapter });
  // Every tenant model is filtered by the active organisation. A staff
  // session with no organisation matches nothing. Cron and webhooks have
  // no session until they call runInOrganisation or runAsSystem.
  const guarded = base.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          return enforceTenantOperation({
            base,
            model,
            operation,
            args,
            query,
            resolveScope: async () => {
              // Integration tests turn implicit scope off. Skip the NextAuth
              // import entirely so the suite can seed without a Next server.
              if (process.env.ORGANISATION_SCOPE_IMPLICIT === "off") {
                return { kind: "anonymous" };
              }
              try {
                const { resolveImplicitTenantScope } = await import(
                  "@/server/tenant/implicit-tenant-scope"
                );
                return await resolveImplicitTenantScope();
              } catch (error) {
                // tsx scripts and one-off jobs are not Next server components.
                // They have no staff session. Leaving them anonymous keeps the
                // previous behaviour: they see rows until they call
                // runInOrganisation. A real failure inside Next is rethrown.
                if (
                  error instanceof Error &&
                  error.message.includes("Server Component")
                ) {
                  return { kind: "anonymous" };
                }
                throw error;
              }
            },
          });
        },
      },
    },
  });
  return guarded as unknown as PrismaClient;
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
