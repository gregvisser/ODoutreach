/** Pure label/style helpers for support tickets (no server imports). */

/**
 * Mirrors the ticket description's own 10-character floor
 * (`src/app/(app)/support/actions.ts`'s `createSupportTicket`), so a
 * resolution note can't be blank or trivial while the report that prompted it
 * had to clear the same bar.
 */
export const MIN_RESOLUTION_NOTE_LENGTH = 10;

/** True once a resolution note is long enough to close a ticket. */
export function isResolutionNoteReady(note: string): boolean {
  return note.trim().length >= MIN_RESOLUTION_NOTE_LENGTH;
}

export function supportPriorityLabel(p: string): string {
  switch (p) {
    case "LOW":
      return "Low";
    case "MEDIUM":
      return "Medium";
    case "HIGH":
      return "High";
    case "CRITICAL":
      return "Critical";
    default:
      return p;
  }
}

export function supportPriorityBadgeClass(p: string): string {
  switch (p) {
    case "CRITICAL":
      return "border-red-500/50 bg-red-500/15 text-red-900 dark:text-red-100";
    case "HIGH":
      return "border-amber-500/50 bg-amber-500/15 text-amber-900 dark:text-amber-100";
    case "MEDIUM":
      return "border-sky-500/40 bg-sky-500/10 text-sky-900 dark:text-sky-100";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

export function supportStatusLabel(s: string): string {
  switch (s) {
    case "OPEN":
      return "Open";
    case "IN_REVIEW":
      return "In review";
    case "AWAITING_APPROVAL":
      return "Awaiting approval";
    case "APPROVED":
      return "Approved";
    case "RESOLVED":
      return "Resolved";
    case "REJECTED":
      return "Rejected";
    default:
      return s;
  }
}

export function supportStatusBadgeClass(s: string): string {
  switch (s) {
    case "OPEN":
      return "border-sky-500/40 bg-sky-500/10 text-sky-900 dark:text-sky-100";
    case "IN_REVIEW":
      return "border-indigo-500/40 bg-indigo-500/10 text-indigo-900 dark:text-indigo-100";
    case "AWAITING_APPROVAL":
      return "border-amber-500/50 bg-amber-500/15 text-amber-900 dark:text-amber-100";
    case "APPROVED":
      return "border-emerald-500/50 bg-emerald-500/15 text-emerald-900 dark:text-emerald-100";
    case "RESOLVED":
      return "border-emerald-600/40 bg-emerald-600/10 text-emerald-900 dark:text-emerald-100";
    case "REJECTED":
      return "border-destructive/40 bg-destructive/10 text-destructive";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}
