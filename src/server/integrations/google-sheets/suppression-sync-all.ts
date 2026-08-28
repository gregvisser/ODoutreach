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
export type SuppressionSyncAllResult = {
  sources: number;
  succeeded: number;
  failed: number;
  rowsWritten: number;
  errors: string[];
};

export async function syncAllConfiguredSuppressionSources(): Promise<SuppressionSyncAllResult> {
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
  };

  for (const source of sources) {
    const who = `${source.client.name} — ${suppressionKindLabel(source.kind)}`;
    try {
      const r = await syncSuppressionSourceFromGoogle({ sourceId: source.id });
      if (r.ok) {
        result.succeeded += 1;
        result.rowsWritten += r.rowsWritten ?? 0;
      } else {
        result.failed += 1;
        // A failure with no message still gets a line. Counting a failure and
        // then saying nothing about it is how two dead blocklists stayed
        // invisible for weeks.
        result.errors.push(
          `${who}: ${r.error ?? "sync failed with no reason given"}`.slice(0, 300),
        );
      }
    } catch (e) {
      result.failed += 1;
      result.errors.push(
        `${who}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300),
      );
      // continue — one broken sheet must not stop the others
    }
  }

  return result;
}
