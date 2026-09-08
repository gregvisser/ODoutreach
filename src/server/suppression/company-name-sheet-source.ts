import "server-only";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { extractGoogleSpreadsheetId } from "@/lib/spreadsheet-url";
import { previewCompanyNameSheet } from "@/lib/suppression/company-name-sheet";
import { addCompanyNamesInTransaction } from "./company-names";

async function lockLiveClient(tx: Prisma.TransactionClient, clientId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Client" WHERE id=${clientId} AND "deletedAt" IS NULL FOR NO KEY UPDATE`;
  if (!rows.length) throw Error("Client unavailable");
}

/** Caller must authenticate OpenDoors staff; stored active identity is checked again here. */
export async function saveCompanySheetSource(input: { clientId: string; staffUserId: string; urlOrId: string; tabName: string }) {
  const spreadsheetId = extractGoogleSpreadsheetId(input.urlOrId);
  const tabName = input.tabName.trim();
  if (!spreadsheetId || !tabName || tabName.length > 100 || /[\p{Cc}]/u.test(tabName)) throw Error("Enter a Google Sheet URL and its tab name.");
  return prisma.$transaction(async tx => {
    await lockLiveClient(tx, input.clientId);
    if (!await tx.staffUser.findFirst({ where: { id: input.staffUserId, isActive: true }, select: { id: true } })) throw Error("Active staff required");
    const previous = await tx.companyDncSheetSource.findUnique({ where: { clientId: input.clientId } });
    const source = await tx.companyDncSheetSource.upsert({
      where: { clientId: input.clientId },
      create: { clientId: input.clientId, spreadsheetId, tabName },
      update: { spreadsheetId, tabName, revision: { increment: 1 }, lastAttemptAt: null, lastSuccessAt: null, lastError: null, currentNames: [], retainedCount: previous?.knownNames.length ?? 0 },
    });
    await tx.auditLog.create({ data: { clientId: input.clientId, staffUserId: input.staffUserId, action: "UPDATE", entityType: "CompanyDncSheetSource", entityId: source.id, metadata: { kind: "company_sheet_connection", spreadsheetId, tabName, revision: source.revision } } });
    return source;
  });
}

export async function loadCompanySheetSource(clientId: string) {
  return prisma.companyDncSheetSource.findFirst({ where: { clientId, client: { deletedAt: null } } });
}

/** Never let a failed old request overwrite the state of a newer connection/sync. */
export async function recordCompanySheetReadFailure(sourceId: string, revision: number, error: string) {
  const result = await prisma.companyDncSheetSource.updateMany({
    where: { id: sourceId, revision, client: { deletedAt: null } },
    data: { revision: { increment: 1 }, lastAttemptAt: new Date(), lastError: error },
  });
  return { ok: false as const, stale: result.count === 0, error: result.count ? error : "The sheet connection or sync changed. Refresh and sync again." };
}

/** A fetch outside the transaction must carry the exact source revision it read. */
export async function applyCompanySheetRead(input: { sourceId: string; revision: number; values: unknown; staffUserId: string | null }) {
  const preview = previewCompanyNameSheet(input.values);
  return prisma.$transaction(async tx => {
    const source = await tx.companyDncSheetSource.findUnique({ where: { id: input.sourceId } });
    if (!source) throw Error("Company sheet unavailable");
    await lockLiveClient(tx, source.clientId);
    if (input.staffUserId && !await tx.staffUser.findFirst({ where: { id: input.staffUserId, isActive: true }, select: { id: true } })) throw Error("Active staff required");
    const claimed = await tx.companyDncSheetSource.updateMany({ where: { id: source.id, revision: input.revision }, data: { revision: { increment: 1 }, lastAttemptAt: new Date() } });
    if (!claimed.count) return { ok: false as const, stale: true, error: "The sheet connection or sync changed. Refresh and sync again." };
    if (preview.errors.length) {
      const error = preview.errors.slice(0, 5).map(item => `Row ${item.row}: ${item.message}`).join(" ");
      await tx.companyDncSheetSource.update({ where: { id: source.id }, data: { lastError: error } });
      return { ok: false as const, stale: false, error };
    }
    const added = await addCompanyNamesInTransaction(tx, { clientId: source.clientId, staffUserId: input.staffUserId, preview });
    const currentNames = preview.entries.map(entry => entry.canonicalName);
    const current = new Set(currentNames);
    const knownNames = [...new Set([...source.knownNames, ...currentNames])];
    const retainedCount = knownNames.filter(name => !current.has(name)).length;
    const saved = await tx.companyDncSheetSource.update({ where: { id: source.id }, data: { knownNames, currentNames, retainedCount, lastSuccessAt: new Date(), lastError: null } });
    await tx.auditLog.create({ data: { clientId: source.clientId, staffUserId: input.staffUserId, action: "UPDATE", entityType: "CompanyDncSheetSource", entityId: source.id, metadata: { kind: "company_sheet_sync", revision: saved.revision, added: added.added, currentCount: currentNames.length, retainedCount } } });
    return { ok: true as const, added: added.added, duplicates: added.duplicates, currentCount: currentNames.length, retainedCount };
  });
}
