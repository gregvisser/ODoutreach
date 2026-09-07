import "server-only";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { canonicalCompanyName, COMPANY_NAME_MATCH_VERSION, matchCompanyName, MAX_COMPANY_NAME_LENGTH, type CompanyNameDecision } from "@/lib/suppression/company-name";
import { previewCompanyNameImport } from "@/lib/suppression/company-name-import";

type CompanyDb = Pick<Prisma.TransactionClient, "companyDncEntry" | "companyDncDecision">;

/** Read current entries and scoped decisions each time; do not cache an allow. */
export async function evaluateCompanyName(clientId: string, company: string | null | undefined, db: CompanyDb = prisma): Promise<CompanyNameDecision> {
  const entries = await db.companyDncEntry.findMany({ where: { clientId }, orderBy: { id: "asc" } });
  const match = matchCompanyName(company, entries);
  if (match.outcome !== "REVIEW" || !match.matchedEntryIds.length) return match;
  const decisions = await db.companyDncDecision.findMany({ where: {
    clientId, companyKey: match.canonicalName, ruleVersion: COMPANY_NAME_MATCH_VERSION,
    entryId: { in: match.matchedEntryIds },
  } });
  const blocked = decisions.filter(decision => decision.outcome === "BLOCK");
  if (blocked.length) return { ...match, outcome: "BLOCK", matchedEntryIds: blocked.map(decision => decision.entryId) };
  const allowed = new Set(decisions.filter(decision => decision.outcome === "ALLOW").map(decision => decision.entryId));
  const pending = match.matchedEntryIds.filter(id => !allowed.has(id));
  return { ...match, outcome: pending.length ? "REVIEW" : "CLEAR", matchedEntryIds: pending };
}

/** Internal service: the server action must establish staff/client permission. */
export async function addCompanyNames(input: { clientId: string; staffUserId: string; text: string; format: "text" | "csv" }) {
  const preview = previewCompanyNameImport(input.text, input.format);
  if (preview.errors.length) return { ok: false as const, errors: preview.errors };
  return prisma.$transaction(async tx => {
    const inserted = await tx.companyDncEntry.createMany({
      data: preview.entries.map(entry => ({ ...entry, clientId: input.clientId })), skipDuplicates: true,
    });
    await tx.auditLog.create({ data: {
      clientId: input.clientId, staffUserId: input.staffUserId, action: "CREATE", entityType: "CompanyDncEntry",
      metadata: { kind: "company_name_dnc_import", added: inserted.count, duplicates: preview.duplicates + preview.entries.length - inserted.count, entries: preview.entries },
    } });
    return { ok: true as const, added: inserted.count, duplicates: preview.duplicates + preview.entries.length - inserted.count };
  });
}

/** A decision cannot be reused for another client, list entry or employer. */
export async function decideCompanyName(input: { clientId: string; staffUserId: string; entryId: string; company: string; outcome: "ALLOW" | "BLOCK" }) {
  const companyKey = canonicalCompanyName(input.company);
  if (!companyKey || companyKey.length > MAX_COMPANY_NAME_LENGTH) return { ok: false as const, error: "Enter the contact's current company name first." };
  return prisma.$transaction(async tx => {
    const entry = await tx.companyDncEntry.findFirst({ where: { id: input.entryId, clientId: input.clientId } });
    if (!entry) return { ok: false as const, error: "That company entry is not available for this client." };
    const match = matchCompanyName(input.company, [entry]);
    if (match.outcome !== "REVIEW" || match.reason !== "similar_name") return { ok: false as const, error: "Only a current similar-name match can be reviewed. Exact listed names remain blocked." };
    const key = { clientId: input.clientId, entryId: entry.id, companyKey, ruleVersion: COMPANY_NAME_MATCH_VERSION };
    const decision = await tx.companyDncDecision.upsert({
      where: { clientId_entryId_companyKey_ruleVersion: key },
      create: { ...key, outcome: input.outcome }, update: { outcome: input.outcome, decidedAt: new Date() },
    });
    await tx.auditLog.create({ data: {
      clientId: input.clientId, staffUserId: input.staffUserId, action: "UPDATE", entityType: "CompanyDncDecision", entityId: decision.id,
      metadata: { kind: "company_name_dnc_review", company: input.company, companyKey, entryId: entry.id, originalName: entry.originalName, outcome: input.outcome, ruleVersion: COMPANY_NAME_MATCH_VERSION },
    } });
    return { ok: true as const };
  });
}
