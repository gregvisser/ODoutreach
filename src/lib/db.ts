import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

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
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
