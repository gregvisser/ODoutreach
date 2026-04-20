import "server-only";

import Papa from "papaparse";

import type { ContactSource } from "@/generated/prisma/enums";
import {
  mapContactRow,
  type MappedContactRow,
} from "@/lib/contact-import-contract";
import { prisma } from "@/lib/db";
import {
  extractDomainFromEmail,
  isValidEmailFormat,
  normalizeEmail,
} from "@/lib/normalize";
import { attachContactsToClientList } from "@/server/contacts/contact-lists";
import { refreshContactSuppressionFlagsForClient } from "@/server/outreach/suppression-guard";

export type CsvImportSummary = {
  totalRows: number;
  imported: number;
  skippedInvalid: number;
  skippedDuplicate: number;
  errors: string[];
  listAttachedAdded?: number;
  listAttachedSkipped?: number;
};

function normHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, "_");
}

function getCell(row: Record<string, string>, ...aliases: string[]): string {
  const entries = Object.entries(row);
  for (const alias of aliases) {
    const target = normHeader(alias);
    for (const [k, v] of entries) {
      if (normHeader(k) === target) {
        return String(v ?? "").trim();
      }
    }
  }
  return "";
}

function pickMapped(
  mapped: MappedContactRow,
  field: keyof MappedContactRow,
): string {
  const value = mapped[field];
  return typeof value === "string" ? value.trim() : "";
}

function parseContactSource(raw: string): ContactSource {
  const u = raw.trim().toUpperCase();
  if (u === "MANUAL" || u === "ROCKETREACH" || u === "CSV_IMPORT") {
    return u as ContactSource;
  }
  return "CSV_IMPORT";
}

export async function runContactCsvImport(args: {
  clientId: string;
  fileName: string;
  csvText: string;
  /** PR D2: every import must attach to an existing client-scoped list. */
  contactListId: string;
  addedByStaffUserId?: string | null;
}): Promise<{
  batchId: string;
  summary: CsvImportSummary;
  contactListId: string;
}> {
  const { clientId, fileName, csvText, contactListId, addedByStaffUserId } =
    args;

  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });

  const rows = parsed.data.filter((row) =>
    Object.values(row).some((v) => String(v).trim()),
  );

  const summary: CsvImportSummary = {
    totalRows: rows.length,
    imported: 0,
    skippedInvalid: 0,
    skippedDuplicate: 0,
    errors: [],
  };

  const batch = await prisma.contactImportBatch.create({
    data: {
      clientId,
      fileName,
      rowCount: rows.length,
      status: "PROCESSING",
    },
  });

  const existingRows = await prisma.contact.findMany({
    where: { clientId },
    select: { id: true, email: true },
  });
  const existing = new Set(
    existingRows.map((c) => normalizeEmail(c.email)),
  );
  const existingIdByEmail = new Map(
    existingRows.map((c) => [normalizeEmail(c.email), c.id]),
  );

  const seenInFile = new Set<string>();
  const touchedContactIds: string[] = [];

  try {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      const rowNum = i + 2;

      const mapped = mapContactRow(row);
      let email = pickMapped(mapped, "email");
      const fullName = pickMapped(mapped, "fullName");
      let first = pickMapped(mapped, "firstName");
      let last = pickMapped(mapped, "lastName");
      const company = pickMapped(mapped, "company");
      const title = pickMapped(mapped, "title");
      const linkedIn = pickMapped(mapped, "linkedIn");
      const mobilePhone = pickMapped(mapped, "mobilePhone");
      const officePhone = pickMapped(mapped, "officePhone");
      const location = pickMapped(mapped, "location");
      const city = pickMapped(mapped, "city");
      const country = pickMapped(mapped, "country");
      // `domain` and `source` columns are operator-only hints; they are not
      // part of the canonical import contract but remain supported for
      // backwards compatibility with existing operator CSVs.
      const domainCol = getCell(row, "domain");
      const sourceRaw = getCell(row, "source", "origin");

      if (!email && fullName && !first && !last) {
        summary.skippedInvalid++;
        if (summary.errors.length < 12) {
          summary.errors.push(`Row ${rowNum}: missing email`);
        }
        continue;
      }

      email = normalizeEmail(email);
      if (!email || !isValidEmailFormat(email)) {
        summary.skippedInvalid++;
        if (summary.errors.length < 12) {
          summary.errors.push(`Row ${rowNum}: invalid or missing email`);
        }
        continue;
      }

      if (seenInFile.has(email)) {
        summary.skippedDuplicate++;
        continue;
      }
      seenInFile.add(email);

      if (existing.has(email)) {
        summary.skippedDuplicate++;
        // PR D2: the contact already exists for this client but the operator
        // explicitly routed this import to a named list, so make sure the
        // existing row is a member of that list (idempotent).
        const existingId = existingIdByEmail.get(email);
        if (existingId) touchedContactIds.push(existingId);
        continue;
      }

      if (!first && !last && fullName) {
        const parts = fullName.trim().split(/\s+/);
        if (parts.length >= 2) {
          first = parts[0]!;
          last = parts.slice(1).join(" ");
        } else if (parts.length === 1) {
          first = parts[0]!;
        }
      }

      const emailDomain =
        domainCol.trim() || extractDomainFromEmail(email) || null;

      const created = await prisma.contact.create({
        data: {
          clientId,
          email,
          fullName: fullName || null,
          emailDomain,
          firstName: first || null,
          lastName: last || null,
          company: company || null,
          title: title || null,
          linkedIn: linkedIn || null,
          mobilePhone: mobilePhone || null,
          officePhone: officePhone || null,
          location: location || null,
          city: city || null,
          country: country || null,
          source: parseContactSource(sourceRaw),
          importBatchId: batch.id,
        },
        select: { id: true },
      });

      existing.add(email);
      existingIdByEmail.set(email, created.id);
      touchedContactIds.push(created.id);
      summary.imported++;
    }

    let attachResult = { added: 0, skipped: 0 };
    if (touchedContactIds.length > 0) {
      attachResult = await attachContactsToClientList({
        clientId,
        contactListId,
        contactIds: touchedContactIds,
        addedByStaffUserId: addedByStaffUserId ?? null,
      });
    }
    summary.listAttachedAdded = attachResult.added;
    summary.listAttachedSkipped = attachResult.skipped;

    const doneSummary = {
      ...summary,
      contactListId,
      completedAt: new Date().toISOString(),
    };

    await prisma.contactImportBatch.update({
      where: { id: batch.id },
      data: {
        status: "COMPLETED",
        rowCount: rows.length,
        summary: doneSummary as object,
        completedAt: new Date(),
      },
    });

    await refreshContactSuppressionFlagsForClient(clientId);

    return { batchId: batch.id, summary, contactListId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.contactImportBatch.update({
      where: { id: batch.id },
      data: {
        status: "FAILED",
        errorMessage: msg.slice(0, 2000),
        summary: { ...summary, fatal: msg } as object,
        completedAt: new Date(),
      },
    });
    throw e;
  }
}
