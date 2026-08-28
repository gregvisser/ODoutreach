import "server-only";

import { prisma } from "@/lib/db";
import { suppressionKindLabel } from "@/lib/suppression/staff-labels";

import { syncSuppressionSourceFromGoogle } from "./suppression-sync";

/**
 * Scheduled re-sync of EVERY configured do-not-contact sheet.
 *
 * Staff add leads' emails/domains to the DNC Google Sheets, but until now
 * those edits only reached the database when someone remembered to click
 * "Sync now". A follow-up dispatched in the meantime would still send —
 * the send-time guard (`evaluateSuppression` in execute-one) reads the
 * SuppressedEmail/SuppressedDomain tables, which were stale.
 *
 * This runs from the replies cron: each configured source re-syncs via
 * the same single-source function the UI button uses (atomic
 * delete+recreate under the bulk transaction options, then a contact-flag
 * refresh). One failing sheet never blocks the rest; per-source errors
 * are recorded on the source row by the sync itself and summarised here.
 */
/**
 * What one sheet did, attributed to the client whose list it is.
 *
 * The result used to be totals only — `succeeded`, `failed`, and one summed
 * `rowsWritten` across every source. A working sheet vanished into the total
 * and a broken one surfaced only as a sentence in `errors`, so there was no
 * per-client number anywhere: the 2026-08-28 production run reported
 * `rowsWritten: 50692` and not one row of it could be attributed. A blocklist
 * is per-client by definition, and "this client has no protection" is exactly
 * the thing an aggregate hides.
 */
export type SuppressionSourceOutcome = {
  /** The client whose list this is — never a bare source id. */
  client: string;
  /** "Whole domains" / "Email addresses", as staff see it. */
  kind: string;
  ok: boolean;
  /** The A1 range actually read, so the count can be checked against the Sheet. */
  resolvedRange?: string;
  /** Rows stored for this source before the replace was considered. */
  previousCount?: number;
  /** Rows stored. Absent on a dry run, which stored none. */
  rowsWritten?: number;
  /** Rows a dry run would have stored. */
  wouldWrite?: number;
  /**
   * The guard refused a shrink. Distinguished from a broken sheet because the
   * two need different actions: this one PROTECTED the list and needs a human
   * to agree, the other needs someone to open the Sheet.
   */
  refusedShrink?: boolean;
  error?: string;
};

export type SuppressionSyncAllResult = {
  sources: number;
  succeeded: number;
  failed: number;
  rowsWritten: number;
  errors: string[];
  /** One entry per configured sheet, in the order they were processed. */
  outcomes: SuppressionSourceOutcome[];
  /** Present only when nothing was written. */
  dryRun?: boolean;
};

export type SuppressionSyncAllOptions = {
  /**
   * Ask every sheet what it WOULD do and write nothing.
   *
   * Never set by the cron, which must keep writing — a dry run that became the
   * default would silently stop every blocklist updating, which is a quieter
   * version of the outage this whole path exists to fix.
   */
  dryRun?: boolean;
};

export async function syncAllConfiguredSuppressionSources(
  options: SuppressionSyncAllOptions = {},
): Promise<SuppressionSyncAllResult> {
  const dryRun = options.dryRun === true;
  const sources = await prisma.suppressionSource.findMany({
    where: { spreadsheetId: { not: null } },
    // The client name and list kind are selected for the ERROR LINE, not for
    // the sync. A reason that reads `cmpnsa18a00m0gapb5fh8nox6: Check the Sheet
    // tab name and range` sends Greg hunting through 34 sources to find out
    // whose blocklist stopped; "Train Hugger — Whole domains — …" is a job.
    select: { id: true, kind: true, client: { select: { name: true } } },
    orderBy: { updatedAt: "asc" },
  });

  const result: SuppressionSyncAllResult = {
    sources: sources.length,
    succeeded: 0,
    failed: 0,
    rowsWritten: 0,
    errors: [],
    outcomes: [],
    ...(dryRun ? { dryRun: true } : {}),
  };

  for (const source of sources) {
    const kind = suppressionKindLabel(source.kind);
    const who = `${source.client.name} — ${kind}`;
    const base = { client: source.client.name, kind };
    try {
      const r = await syncSuppressionSourceFromGoogle({
        sourceId: source.id,
        dryRun,
      });
      if (r.ok) {
        result.succeeded += 1;
        result.rowsWritten += r.rowsWritten ?? 0;
        result.outcomes.push({
          ...base,
          ok: true,
          resolvedRange: r.resolvedRange,
          previousCount: r.previousCount,
          ...(dryRun
            ? { wouldWrite: r.wouldWrite }
            : { rowsWritten: r.rowsWritten }),
        });
      } else {
        result.failed += 1;
        const error = r.error ?? "sync failed with no reason given";
        // A failure with no message still gets a line. Counting a failure and
        // then saying nothing about it is how two dead blocklists stayed
        // invisible for weeks.
        result.errors.push(`${who}: ${error}`.slice(0, 300));
        result.outcomes.push({
          ...base,
          ok: false,
          error,
          resolvedRange: r.resolvedRange,
          previousCount: r.previousCount,
          ...(r.blockedShrink ? { refusedShrink: true } : {}),
        });
      }
    } catch (e) {
      result.failed += 1;
      const error = e instanceof Error ? e.message : String(e);
      result.errors.push(`${who}: ${error}`.slice(0, 300));
      // An outcome even here, so the report has one row per configured sheet.
      // A sheet missing from the list reads as "not configured", which is a
      // different and much more comfortable problem than "it threw".
      result.outcomes.push({ ...base, ok: false, error });
      // continue — one broken sheet must not stop the others
    }
  }

  return result;
}
