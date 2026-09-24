import { SUPPRESSION_HELD_SHRINK_MESSAGE_CLASSNAME } from "@/lib/suppression/staff-labels";
import {
  isSuppressionHeldShrinkLastError,
  parseSuppressionHeldShrinkRemovedCount,
  suppressionHeldShrinkCombinedStaffMessage,
  suppressionStaffFacingSyncLastError,
} from "@/lib/suppression/staff-sync-copy";

type SourceRow = {
  kind: "EMAIL" | "DOMAIN";
  syncStatus: string;
  lastError: string | null;
};

type Props = {
  sources: SourceRow[];
};

/**
 * Amber banner when a client's sheet sync is in the fail-closed held-shrink
 * state. Sending to non-suppressed contacts continues; only missing sheet rows
 * stay blocked.
 */
export function SuppressionHeldShrinkCallout({ sources }: Props) {
  const held = sources.filter(
    (s) =>
      s.syncStatus === "ERROR" && isSuppressionHeldShrinkLastError(s.lastError),
  );
  if (held.length === 0) return null;

  const emailRemoved = parseSuppressionHeldShrinkRemovedCount(
    "EMAIL",
    sources.find((s) => s.kind === "EMAIL")?.lastError,
  );
  const domainRemoved = parseSuppressionHeldShrinkRemovedCount(
    "DOMAIN",
    sources.find((s) => s.kind === "DOMAIN")?.lastError,
  );

  const message =
    held.length > 1
      ? suppressionHeldShrinkCombinedStaffMessage({
          emailRemoved,
          domainRemoved,
        })
      : suppressionStaffFacingSyncLastError(held[0]!.kind, held[0]!.lastError) ??
        suppressionHeldShrinkCombinedStaffMessage({
          emailRemoved,
          domainRemoved,
        });

  return (
    <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-3 text-sm">
      <p className={SUPPRESSION_HELD_SHRINK_MESSAGE_CLASSNAME}>{message}</p>
    </div>
  );
}
