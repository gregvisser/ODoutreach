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
import { limitSheetsRead } from "./sheets-read-limiter";
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
  /**
   * Resolve the tab, read the Sheet, normalise it and run the guard — then
   * stop, before anything is written.
   *
   * This exists because "how many rows does that client's list actually have?"
   * had no answer that did not involve running a delete-then-insert on their
   * live blocklist first. It deliberately shares this function rather than
   * being a separate preview: a preview that resolved the tab, deduped or
   * applied the public-suffix rule differently would predict nothing.
   *
   * Writes NOTHING, including the source's own status columns — asking a
   * question must not look like a failed scheduled sync afterwards.
   */
  dryRun?: boolean;
};

export type SuppressionSyncResult = {
  ok: boolean;
  /** Rows actually stored. Never set by a dry run, which stored none. */
  rowsWritten?: number;
  /** Rows a dry run WOULD have stored. Only ever set by a dry run. */
  wouldWrite?: number;
  /** Rows already stored for this source before the replace was considered. */
  previousCount?: number;
  /**
   * The A1 range actually asked for. Reported because the whole outage was a
   * range nobody could see: two sheets were read as `Sheet1!A1:Z50000` for
   * weeks and the only place that string appeared was an error message.
   */
  resolvedRange?: string;
  /** True when nothing was written because the caller only asked. */
  dryRun?: true;
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
 * The result of asking a spreadsheet for its tab titles.
 *
 * "It failed" and "it has no tabs" used to collapse into one empty array, and
 * that conflation was the defect: a metadata call refused for quota returned
 * `[]`, which read as "no tabs", which fell back to the historic `Sheet1` guess
 * — and this function's caller then runs a delete-then-insert. A momentary
 * quota blip could therefore aim a REPLACE at the wrong tab and silently
 * unblock a client's whole do-not-contact list.
 */
type SheetTabLookup = { ok: true; titles: string[] } | { ok: false };

/**
 * The tab titles of a spreadsheet.
 *
 * Used twice: to resolve which tab to read when no range is saved, and to name
 * the real tabs in a range failure. For years it was only the second, so the
 * product diagnosed its own outage in an error message and then did nothing
 * with the diagnosis.
 *
 * Still never throws — a second failure on the error path must not replace the
 * first one — but it now REPORTS its failure rather than disguising it as an
 * answer, so the resolve path can refuse instead of guessing.
 */
async function readSheetTabTitles(
  spreadsheetId: string,
): Promise<SheetTabLookup> {
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: loadServiceAccountCredentials(),
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });
    const sheets = google.sheets({ version: "v4", auth });
    const meta = await limitSheetsRead(() =>
      sheets.spreadsheets.get({
        spreadsheetId,
        fields: "sheets.properties.title",
      }),
    );
    return {
      ok: true,
      titles: (meta.data.sheets ?? [])
        .map((s) => s.properties?.title)
        .filter((t): t is string => typeof t === "string" && t.trim().length > 0),
    };
  } catch {
    return { ok: false };
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

  const dryRun = input.dryRun === true;

  /**
   * Every status write in this function goes through here.
   *
   * A dry run must leave the source row byte-identical: stamping SYNCING, or
   * ERROR with a reason, would make "someone asked what this sheet holds"
   * indistinguishable on the Sources screen from "the scheduled sync broke".
   */
  const recordStatus = async (
    data: Parameters<typeof prisma.suppressionSource.update>[0]["data"],
  ) => {
    if (dryRun) return;
    await prisma.suppressionSource.update({ where: { id: source.id }, data });
  };

  const { clientId, spreadsheetId, kind, sheetRange } = source;
  if (!spreadsheetId) {
    const err = SUPPRESSION_SYNC_MESSAGES.spreadsheetMissing;
    await recordStatus({ syncStatus: "ERROR", lastError: err });
    return { ok: false, error: err };
  }

  const saDisplay = getGoogleServiceAccountDisplayInfo();
  if (!saDisplay.configured) {
    const err = SUPPRESSION_SYNC_MESSAGES.adminCredentialsRequired;
    await recordStatus({ syncStatus: "ERROR", lastError: err });
    return { ok: false, error: err };
  }

  await recordStatus({ syncStatus: "SYNCING", lastError: null });

  // Hoisted out of the try so the failure path can say WHICH range it tried.
  //
  // With no saved range this used to assume a tab called "Sheet1" and fail on
  // every sheet that has never had one. Ask the sheet instead — an explicit
  // range still wins.
  const savedRange = sheetRange?.trim();

  /**
   * The range to save back to this source once it is PROVEN readable.
   *
   * Non-null only when this run resolved the range itself and is going to
   * write. Resolving costs a `spreadsheets.get` per source, and on 2026-08-29
   * all 34 configured sources had no saved range — so every 15-minute cron
   * paid 68 Google reads against a 60-per-minute ceiling to re-derive 34
   * answers that had not changed. Remembering the answer makes the lookup a
   * once-per-sheet cost instead of a forever cost.
   *
   * This is a write to a client's configuration, so it is deliberately narrow:
   * only when the operator left the range blank (an explicit range is theirs
   * and is never overwritten), only when the tab names were genuinely read,
   * only after Google served that exact range, and never on a dry run. An
   * operator who dislikes the saved range clears the box and the sync resolves
   * afresh, exactly as it does today.
   */
  let rangeToRemember: string | null = null;
  let range: string;

  if (savedRange) {
    range = savedRange;
  } else {
    const lookup = await readSheetTabTitles(spreadsheetId);
    // A spreadsheet always has at least one tab, so an empty list here means
    // the answer is unusable rather than that the sheet is empty. Both cases
    // refuse: without tab names there is no range this function can defend,
    // and the path below DELETES before it inserts.
    if (!lookup.ok || lookup.titles.length === 0) {
      const err = SUPPRESSION_SYNC_MESSAGES.tabsUnreadable;
      await recordStatus({ syncStatus: "ERROR", lastError: err });
      return {
        ok: false,
        error: err,
        ...(dryRun ? { dryRun: true as const } : {}),
      };
    }
    range = resolveDefaultSheetRange(lookup.titles);
    if (!dryRun) rangeToRemember = range;
  }

  /** Folded into the status writes that follow a successful READ, so
   *  remembering the range never costs an extra round trip — and never
   *  happens on the catch path, where the range is exactly what is in doubt. */
  const rememberRange = rangeToRemember ? { sheetRange: rangeToRemember } : {};

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: loadServiceAccountCredentials(),
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });
    const sheets = google.sheets({ version: "v4", auth });

    const res = await limitSheetsRead(() =>
      sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
      }),
    );

    const flat = flattenSheetValues(
      res.data.values as string[][] | undefined,
    );

    const outcome = await applySheetToSuppressionTables({
      clientId,
      sourceId: source.id,
      kind,
      cells: flat,
      confirmShrink: input.confirmShrink === true,
      dryRun,
    });

    // Refused, not failed: the stored rows are untouched and everyone who was
    // blocked still is. Recorded as ERROR and WITHOUT stamping lastSyncedAt,
    // because a list that silently stopped updating is how this started.
    if (outcome.refused) {
      await recordStatus({
        syncStatus: "ERROR",
        lastError: outcome.refusal.reason.slice(0, 2000),
        // Remembered even though the sync was refused: the refusal is about
        // how MANY rows the sheet holds, not about which tab they are on, and
        // Google has already served this range. A source parked in a refused
        // shrink — Train Hugger's domain list has been since 2026-08-14 —
        // would otherwise re-resolve its tab every fifteen minutes for ever.
        ...rememberRange,
      });
      return {
        ok: false,
        error: outcome.refusal.reason,
        blockedShrink: outcome.refusal,
        previousCount: outcome.refusal.previousCount,
        resolvedRange: range,
        ...(dryRun ? { dryRun: true as const } : {}),
      };
    }

    const { written, previousCount } = outcome;

    // Asked, not done. Returned before the success stamp and the flag refresh
    // so a dry run cannot mark a list as synced that it never touched.
    if (dryRun) {
      return {
        ok: true,
        dryRun: true,
        wouldWrite: written,
        previousCount,
        resolvedRange: range,
      };
    }

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

    await recordStatus({
      syncStatus: "SUCCESS",
      lastSyncedAt: new Date(),
      lastError: null,
      ...rememberRange,
    });

    await refreshContactSuppressionFlagsForClient(clientId);

    return {
      ok: true,
      rowsWritten: written,
      previousCount,
      resolvedRange: range,
      warning,
    };
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    let friendly = formatSuppressionSyncUserError(raw, saDisplay.clientEmail);
    // A range error is the one failure we can diagnose the rest of the way
    // ourselves: the Sheet is readable (a sharing problem answers 403), so the
    // real tab names are one call away. Best-effort — if that call fails too,
    // the original instruction stands unchanged.
    if (isRangeInvalidMessage(friendly)) {
      const lookup = await readSheetTabTitles(spreadsheetId);
      // A failed lookup contributes nothing here rather than refusing: this
      // path is decorating an error that has already happened, and
      // `withSheetTabNames` returns the message unchanged for an empty list.
      friendly = withSheetTabNames(
        friendly,
        range,
        lookup.ok ? lookup.titles : [],
      );
    }
    await recordStatus({
      syncStatus: "ERROR",
      lastError: friendly.slice(0, 2000),
    });
    return {
      ok: false,
      error: friendly,
      resolvedRange: range,
      ...(dryRun ? { dryRun: true as const } : {}),
    };
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
  /** Compute the same numbers, then stop before the delete. */
  dryRun: boolean;
}): Promise<ApplyOutcome> {
  const { clientId, sourceId, kind, cells, confirmShrink, dryRun } = args;

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

      // Placed AFTER the guard so a dry run reports the same verdict the real
      // sync would reach, and BEFORE the delete so it reaches it for free.
      if (dryRun)
        return { refused: false, written: list.length, previousCount };

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

    if (dryRun) return { refused: false, written: list.length, previousCount };

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
