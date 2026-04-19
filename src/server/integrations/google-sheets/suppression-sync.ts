import "server-only";

import { google } from "googleapis";

import type { SuppressionListKind } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import {
  isValidDomainFormat,
  isValidEmailFormat,
  normalizeEmail,
} from "@/lib/normalize";
import { refreshContactSuppressionFlagsForClient } from "@/server/outreach/suppression-guard";

import { loadServiceAccountCredentials } from "./auth";
import { getGoogleServiceAccountDisplayInfo } from "./service-account-display";
import {
  formatSuppressionSyncUserError,
  SUPPRESSION_SYNC_MESSAGES,
} from "./suppression-sync-errors";

export type SuppressionSyncInput = {
  /** Must match the row in DB — caller verifies tenant access. */
  sourceId: string;
};

export type SuppressionSyncResult = {
  ok: boolean;
  rowsWritten?: number;
  error?: string;
  /** Non-fatal hint when sync succeeded but nothing usable was found in cells. */
  warning?: string;
};

function flattenSheetValues(values: string[][] | null | undefined): string[] {
  if (!values?.length) return [];
  const out: string[] = [];
  for (const row of values) {
    for (const cell of row) {
      const t = cell?.trim();
      if (t) out.push(t);
    }
  }
  return out;
}

/**
 * Full sync for one `SuppressionSource`: reads Google Sheet, replaces rows for that source only,
 * scoped by `clientId` from the database (never from the sheet).
 */
export async function syncSuppressionSourceFromGoogle(
  input: SuppressionSyncInput,
): Promise<SuppressionSyncResult> {
  const source = await prisma.suppressionSource.findUnique({
    where: { id: input.sourceId },
  });

  if (!source) {
    return { ok: false, error: "Suppression source not found" };
  }

  const { clientId, spreadsheetId, kind, sheetRange } = source;
  if (!spreadsheetId) {
    const err = SUPPRESSION_SYNC_MESSAGES.spreadsheetMissing;
    await prisma.suppressionSource.update({
      where: { id: source.id },
      data: {
        syncStatus: "ERROR",
        lastError: err,
      },
    });
    return { ok: false, error: err };
  }

  const saDisplay = getGoogleServiceAccountDisplayInfo();
  if (!saDisplay.configured) {
    const err = SUPPRESSION_SYNC_MESSAGES.adminCredentialsRequired;
    await prisma.suppressionSource.update({
      where: { id: source.id },
      data: {
        syncStatus: "ERROR",
        lastError: err,
      },
    });
    return { ok: false, error: err };
  }

  await prisma.suppressionSource.update({
    where: { id: source.id },
    data: { syncStatus: "SYNCING", lastError: null },
  });

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: loadServiceAccountCredentials(),
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });
    const sheets = google.sheets({ version: "v4", auth });

    const range = sheetRange?.trim() || "Sheet1!A1:Z50000";

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    const flat = flattenSheetValues(
      res.data.values as string[][] | undefined,
    );

    const written = await applySheetToSuppressionTables({
      clientId,
      sourceId: source.id,
      kind,
      cells: flat,
    });

    let warning: string | undefined;
    if (written === 0) {
      if (flat.length === 0) {
        warning = SUPPRESSION_SYNC_MESSAGES.noDataInRange;
      } else {
        warning =
          kind === "EMAIL"
            ? SUPPRESSION_SYNC_MESSAGES.noValidEmails
            : SUPPRESSION_SYNC_MESSAGES.noValidDomains;
      }
    }

    await prisma.suppressionSource.update({
      where: { id: source.id },
      data: {
        syncStatus: "SUCCESS",
        lastSyncedAt: new Date(),
        lastError: null,
      },
    });

    await refreshContactSuppressionFlagsForClient(clientId);

    return { ok: true, rowsWritten: written, warning };
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    const friendly = formatSuppressionSyncUserError(raw, saDisplay.clientEmail);
    await prisma.suppressionSource.update({
      where: { id: source.id },
      data: {
        syncStatus: "ERROR",
        lastError: friendly.slice(0, 2000),
      },
    });
    return { ok: false, error: friendly };
  }
}

async function applySheetToSuppressionTables(args: {
  clientId: string;
  sourceId: string;
  kind: SuppressionListKind;
  cells: string[];
}): Promise<number> {
  const { clientId, sourceId, kind, cells } = args;

  if (kind === "EMAIL") {
    const emails = new Set<string>();
    for (const cell of cells) {
      const v = normalizeEmail(cell);
      if (v && isValidEmailFormat(v)) emails.add(v);
    }
    const list = [...emails];

    return await prisma.$transaction(async (tx) => {
      await tx.suppressedEmail.deleteMany({
        where: { clientId, sourceId },
      });

      if (list.length === 0) return 0;

      await tx.suppressedEmail.createMany({
        data: list.map((email) => ({
          clientId,
          sourceId,
          email,
        })),
        skipDuplicates: true,
      });
      return list.length;
    });
  }

  const domains = new Set<string>();
  for (const cell of cells) {
    const raw = cell.trim();
    if (!raw) continue;
    let d = raw.toLowerCase();
    d = d.replace(/^https?:\/\//, "");
    const slash = d.indexOf("/");
    if (slash >= 0) d = d.slice(0, slash);
    d = d.replace(/^www\./, "");
    if (d.includes("@")) {
      const at = d.lastIndexOf("@");
      d = d.slice(at + 1);
    }
    d = d.replace(/\.$/, "").trim();
    if (isValidDomainFormat(d)) domains.add(d);
  }

  const list = [...domains];

  return await prisma.$transaction(async (tx) => {
    await tx.suppressedDomain.deleteMany({
      where: { clientId, sourceId },
    });

    if (list.length === 0) return 0;

    await tx.suppressedDomain.createMany({
      data: list.map((domain) => ({
        clientId,
        sourceId,
        domain,
      })),
      skipDuplicates: true,
    });
    return list.length;
  });
}
