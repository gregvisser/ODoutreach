import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type { UniverseSourceType } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";

export type UniverseTableQuery = {
  q?: string;
  hasEmail?: "yes" | "no" | "";
  company?: string;
  jobTitle?: string;
  country?: string;
  sourceType?: UniverseSourceType | "" | "ALL";
  sort?: "lastSeen" | "company" | "email";
  page?: number;
  pageSize?: number;
};

export type UniverseTableRow = {
  id: string;
  fullName: string | null;
  companyName: string | null;
  jobTitle: string | null;
  emailNormalized: string | null;
  mobilePhoneNormalized: string | null;
  officePhoneNormalized: string | null;
  linkedinUrlNormalized: string | null;
  location: string | null;
  country: string | null;
  sourceSummary: string | null;
  firstSeenSourceType: UniverseSourceType;
  lastSeenAt: Date;
  sourceCount: number;
  clientContactCount: number;
};

function buildWhere(input: UniverseTableQuery): Prisma.ContactUniverseWhereInput {
  const where: Prisma.ContactUniverseWhereInput = {};

  if (input.hasEmail === "yes") {
    where.emailNormalized = { not: null };
  } else if (input.hasEmail === "no") {
    where.emailNormalized = null;
  }

  const company = input.company?.trim();
  if (company) {
    where.companyName = { contains: company, mode: "insensitive" };
  }

  const jobTitle = input.jobTitle?.trim();
  if (jobTitle) {
    where.jobTitle = { contains: jobTitle, mode: "insensitive" };
  }

  const country = input.country?.trim();
  if (country) {
    where.country = { contains: country, mode: "insensitive" };
  }

  const st = input.sourceType;
  if (st && st !== "ALL") {
    where.sources = { some: { sourceType: st } };
  }

  const q = input.q?.trim();
  if (q) {
    where.OR = [
      { emailNormalized: { contains: q, mode: "insensitive" } },
      { fullName: { contains: q, mode: "insensitive" } },
      { companyName: { contains: q, mode: "insensitive" } },
      { jobTitle: { contains: q, mode: "insensitive" } },
    ];
  }

  return where;
}

export async function countContactUniverses(input: UniverseTableQuery): Promise<number> {
  return prisma.contactUniverse.count({ where: buildWhere(input) });
}

export async function listContactUniversesForTable(
  input: UniverseTableQuery,
): Promise<{ rows: UniverseTableRow[]; total: number }> {
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(100, Math.max(10, input.pageSize ?? 25));
  const where = buildWhere(input);

  const sortKey = input.sort ?? "lastSeen";
  const orderBy: Prisma.ContactUniverseOrderByWithRelationInput =
    sortKey === "company"
      ? { companyName: "asc" }
      : sortKey === "email"
        ? { emailNormalized: "asc" }
        : { lastSeenAt: "desc" };

  const [total, raw] = await Promise.all([
    prisma.contactUniverse.count({ where }),
    prisma.contactUniverse.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        _count: {
          select: {
            sources: true,
            clientContacts: true,
          },
        },
      },
    }),
  ]);

  const rows: UniverseTableRow[] = raw.map((r) => ({
    id: r.id,
    fullName: r.fullName,
    companyName: r.companyName,
    jobTitle: r.jobTitle,
    emailNormalized: r.emailNormalized,
    mobilePhoneNormalized: r.mobilePhoneNormalized,
    officePhoneNormalized: r.officePhoneNormalized,
    linkedinUrlNormalized: r.linkedinUrlNormalized,
    location: r.location,
    country: r.country,
    sourceSummary: r.sourceSummary,
    firstSeenSourceType: r.firstSeenSourceType,
    lastSeenAt: r.lastSeenAt,
    sourceCount: r._count.sources,
    clientContactCount: r._count.clientContacts,
  }));

  return { rows, total };
}
