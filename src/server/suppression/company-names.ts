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
  return resolveCompanyMatch(clientId, match, db);
}

/** Existing recipients are resolved within the sending client's own contacts. */
export async function evaluateRecipientCompany(clientId: string, email: string, company?: string | null): Promise<CompanyNameDecision> {
  const entries = await prisma.companyDncEntry.findMany({ where: { clientId }, orderBy: { id: "asc" } });
  if (!entries.length) return matchCompanyName(null, []);
  const employer = company === undefined
    ? (await prisma.contact.findUnique({ where: { clientId_email: { clientId, email } }, select: { company: true } }))?.company
    : company;
  return resolveCompanyMatch(clientId, matchCompanyName(employer, entries), prisma);
}

async function resolveCompanyMatch(clientId: string, match: CompanyNameDecision, db: CompanyDb): Promise<CompanyNameDecision> {
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

/** A bounded contact page, with honest totals even when a page has no holds. */
export async function loadCompanyDncPage(clientId: string, page: number, heldPage = 0) {
  const pageSize = 50;
  const entries = await prisma.companyDncEntry.findMany({ where: { clientId }, orderBy: { originalName: "asc" } });
  const totalContacts = entries.length ? await prisma.contact.count({ where: { clientId } }) : 0;
  const currentPage = Math.max(0, Math.min(page, Math.max(0, Math.ceil(totalContacts / pageSize) - 1)));
  const contacts = totalContacts ? await prisma.contact.findMany({ where: { clientId }, orderBy: { id: "asc" }, skip: currentPage * pageSize, take: pageSize, select: { id: true, company: true, email: true, fullName: true } }) : [];
  const reviewed = await Promise.all(contacts.map(async contact => ({
    ...contact, decision: await resolveCompanyMatch(clientId, matchCompanyName(contact.company, entries), prisma),
  })));
  const heldWhere = { clientId, status: "FAILED" as const, lastErrorCode: "COMPANY_REVIEW", providerMessageId: null, dispatchStartedAt: null };
  const heldTotal = await prisma.outboundEmail.count({ where: heldWhere });
  const currentHeldPage = Math.max(0, Math.min(heldPage, Math.max(0, Math.ceil(heldTotal / pageSize) - 1)));
  const heldEmails = await prisma.outboundEmail.findMany({ where: heldWhere, orderBy: [{ createdAt: "asc" }, { id: "asc" }], skip: currentHeldPage * pageSize, take: pageSize, select: { id: true, toEmail: true, subject: true } });
  return {
    entries: entries.slice(0, 200), entryTotal: entries.length, page: currentPage, pageSize, totalContacts, checkedContacts: contacts.length,
    contacts: reviewed.filter(contact => contact.decision.outcome !== "CLEAR").map(contact => ({
      ...contact, matches: entries.filter(entry => contact.decision.matchedEntryIds.includes(entry.id)).map(entry => ({ id: entry.id, originalName: entry.originalName })),
    })), heldEmails, heldTotal, heldPage: currentHeldPage,
  };
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
