import "server-only";

import { google } from "googleapis";

import type { SuppressionListKind } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { BULK_TRANSACTION_OPTIONS, chunk } from "@/lib/db-bulk";
import {
  isStorableSuppressionDomain,
  isValidDomainFormat,
  isValidEmailFormat,
  normalizeEmail,
} from "@/lib/normalize";
import { refreshContactSuppressionFlagsForClient } from "@/server/outreach/suppression-guard";
import {
  decideSuppressionReplace,
  type SuppressionReplaceRefusal,
} from "@/lib/suppression/replace-guard";
import { suppressionShrinkWarning } from "@/lib/suppression/shrink-warning";

import { loadServiceAccountCredentials } from "./auth";
import { getGoogleServiceAccountDisplayInfo } from "./service-account-display";
import { resolveDefaultSheetRange } from "./sheet-range";
import {
  formatSuppressionSyncUserError,
  isRangeInvalidMessage,
  SUPPRESSION_SYNC_MESSAGES,
  withSheetTabNames,
} from "./suppression-sync-errors";

export type SuppressionSyncInput = {
  /** Must match the row in DB — caller verifies tenant access. */
  sourceId: string;
  /**
   * An operator has seen the refused shrink and meant it. Never set by the
   * scheduled re-sync — an unattended job must not be the thing that decides
   * hundreds of people may be contacted again.
   */
  confirmShrink?: boolean;
};

export type SuppressionSyncResult = {
  ok: boolean;
  rowsWritten?: number;
  error?: string;
  /** Non-fatal hint when sync succeeded but nothing usable was found in cells. */
  warning?: string;
  /**
   * Set instead of writing when the replace was refused for removing too much.
   * Present so a caller can offer the confirmation; its absence on a failure
   * means the sync failed for some other reason and confirming would not help.
   */
  blockedShrink?: SuppressionReplaceRefusal;
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
 * The tab titles of a spreadsheet.
 *
 * Used twice: to resolve which tab to read when no range is saved, and to name
 * the real tabs in a range failure. For years it was only the second, so the
 * product diagnosed its own outage in an error message and then did nothing
 * with the diagnosis.
 *
 * Deliberately swallows its own errors and returns `[]`. On the failure path a
 * second failure here must not replace the first one; on the resolve path an
 * empty list means the caller falls back to the historic default, so a
 * transient metadata error is never worse than the old behaviour.
 */
async function readSheetTabTitles(spreadsheetId: string): Promise<string[]> {
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: loadServiceAccountCredentials(),
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });
    const sheets = google.sheets({ version: "v4", auth });
    const meta = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: "sheets.properties.title",
    });
    return (meta.data.sheets ?? [])
      .map((s) => s.properties?.title)
      .filter((t): t is string => typeof t === "string" && t.trim().length > 0);
  } catch {
    return [];
  }
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

  // Hoisted out of the try so the failure path can say WHICH range it tried.
  //
  // With no saved range this used to assume a tab called "Sheet1" and fail on
  // every sheet that has never had one. Ask the sheet instead: an explicit
  // range still wins, and `readSheetTabTitles` cannot throw, so the worst case
  // is the old default.
  const range =
    sheetRange?.trim() ||
    resolveDefaultSheetRange(await readSheetTabTitles(spreadsheetId));

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: loadServiceAccountCredentials(),
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });
    const sheets = google.sheets({ version: "v4", auth });

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    const flat = flattenSheetValues(
      res.data.values as string[][] | undefined,
    );

    const outcome = await applySheetToSuppressionTables({
      clientId,
      sourceId: source.id,
      kind,
      cells: flat,
      confirmShrink: input.confirmShrink === true,
    });

    // Refused, not failed: the stored rows are untouched and everyone who was
    // blocked still is. Recorded as ERROR and WITHOUT stamping lastSyncedAt,
    // because a list that silently stopped updating is how this started.
    if (outcome.refused) {
      await prisma.suppressionSource.update({
        where: { id: source.id },
        data: {
          syncStatus: "ERROR",
          lastError: outcome.refusal.reason.slice(0, 2000),
        },
      });
      return {
        ok: false,
        error: outcome.refusal.reason,
        blockedShrink: outcome.refusal,
      };
    }

    const { written, previousCount } = outcome;

    // A shrink (previously-blocked entries removed) is the costliest silent
    // failure for opt-out data, so it takes precedence over the "nothing
    // usable found" note.
    let warning: string | undefined = suppressionShrinkWarning(
      kind,
      written,
      previousCount,
    );
    if (!warning && written === 0) {
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
    let friendly = formatSuppressionSyncUserError(raw, saDisplay.clientEmail);
    // A range error is the one failure we can diagnose the rest of the way
    // ourselves: the Sheet is readable (a sharing problem answers 403), so the
    // real tab names are one call away. Best-effort — if that call fails too,
    // the original instruction stands unchanged.
    if (isRangeInvalidMessage(friendly)) {
      friendly = withSheetTabNames(
        friendly,
        range,
        await readSheetTabTitles(spreadsheetId),
      );
    }
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

type ApplyOutcome =
  | { refused: false; written: number; previousCount: number }
  | { refused: true; refusal: SuppressionReplaceRefusal };

async function applySheetToSuppressionTables(args: {
  clientId: string;
  sourceId: string;
  kind: SuppressionListKind;
  cells: string[];
  confirmShrink: boolean;
}): Promise<ApplyOutcome> {
  const { clientId, sourceId, kind, cells, confirmShrink } = args;

  /**
   * Runs inside the transaction, after the count and BEFORE the delete — the
   * only place the guard can refuse without anything already being gone.
   */
  const refusalFor = (
    wouldWrite: number,
    previousCount: number,
  ): SuppressionReplaceRefusal | null => {
    if (confirmShrink) return null;
    const decision = decideSuppressionReplace(kind, wouldWrite, previousCount);
    return decision.allowed ? null : decision.refusal;
  };

  if (kind === "EMAIL") {
    const emails = new Set<string>();
    for (const cell of cells) {
      const v = normalizeEmail(cell);
      if (v && isValidEmailFormat(v)) emails.add(v);
    }
    const list = [...emails];

    return await prisma.$transaction(async (tx): Promise<ApplyOutcome> => {
      const previousCount = await tx.suppressedEmail.count({
        where: { clientId, sourceId },
      });

      const refusal = refusalFor(list.length, previousCount);
      if (refusal) return { refused: true, refusal };

      await tx.suppressedEmail.deleteMany({
        where: { clientId, sourceId },
      });

      if (list.length === 0)
        return { refused: false, written: 0, previousCount };

      // Chunked inserts keep each statement bounded; the bulk transaction
      // timeout (vs Prisma's 5s default) lets a large DNC list commit
      // atomically instead of failing with an expired-transaction error.
      for (const batch of chunk(
        list.map((email) => ({ clientId, sourceId, email })),
      )) {
        await tx.suppressedEmail.createMany({
          data: batch,
          skipDuplicates: true,
        });
      }
      return { refused: false, written: list.length, previousCount };
    }, BULK_TRANSACTION_OPTIONS);
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
    // A bare public suffix in a client's sheet — one bad cell, e.g. "co.uk" —
    // would blackhole every recipient ending that way, silently. The shape
    // check alone accepts it, so the PSL guard is what actually refuses it.
    // Dropped rather than failing the whole sync: one bad cell must not stop a
    // client's real do-not-contact list from updating.
    if (isValidDomainFormat(d) && isStorableSuppressionDomain(d)) domains.add(d);
  }

  const list = [...domains];

  return await prisma.$transaction(async (tx): Promise<ApplyOutcome> => {
    const previousCount = await tx.suppressedDomain.count({
      where: { clientId, sourceId },
    });

    const refusal = refusalFor(list.length, previousCount);
    if (refusal) return { refused: true, refusal };

    await tx.suppressedDomain.deleteMany({
      where: { clientId, sourceId },
    });

    if (list.length === 0) return { refused: false, written: 0, previousCount };

    for (const batch of chunk(
      list.map((domain) => ({ clientId, sourceId, domain })),
    )) {
      await tx.suppressedDomain.createMany({
        data: batch,
        skipDuplicates: true,
      });
    }
    return { refused: false, written: list.length, previousCount };
  }, BULK_TRANSACTION_OPTIONS);
}
