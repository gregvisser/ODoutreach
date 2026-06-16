/**
 * F2 — pure helpers for the workspace soft-delete / restore flow.
 *
 * Kept free of any server-only imports so the same confirmation logic runs in
 * the client "danger zone" form (to enable the button) AND on the server
 * (to authorise the mutation). The server is always the source of truth; the
 * client copy is purely for UX.
 */

/**
 * Days a soft-deleted workspace stays recoverable before it is eligible for the
 * separate, deliberate hard purge. Purely informational here — nothing in this
 * file auto-purges; the deadline is surfaced in the recovery UI.
 */
export const WORKSPACE_RECOVERY_WINDOW_DAYS = 30;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Trim only — names are compared exactly (case + internal spacing significant). */
function normalize(value: string): string {
  return value.trim();
}

/**
 * The typed confirmation must equal the workspace name exactly (after trimming
 * leading/trailing whitespace). Empty input never matches. This is the
 * GitHub-style "type the name to confirm" guard against an accidental click.
 */
export function workspaceDeletionConfirmationMatches(
  typed: string,
  workspaceName: string,
): boolean {
  const a = normalize(typed);
  const b = normalize(workspaceName);
  if (a.length === 0 || b.length === 0) return false;
  return a === b;
}

/** When a workspace soft-deleted at `deletedAt` stops being auto-recoverable. */
export function recoveryDeadline(deletedAt: Date): Date {
  return new Date(deletedAt.getTime() + WORKSPACE_RECOVERY_WINDOW_DAYS * MS_PER_DAY);
}

/** True while a soft-deleted workspace is still inside its recovery window. */
export function isWithinRecoveryWindow(deletedAt: Date, now: Date): boolean {
  return now.getTime() <= recoveryDeadline(deletedAt).getTime();
}

/**
 * Whole days remaining in the recovery window (never negative). Used for the
 * "recoverable for N more days" label in the super-admin view.
 */
export function recoveryDaysRemaining(deletedAt: Date, now: Date): number {
  const remainingMs = recoveryDeadline(deletedAt).getTime() - now.getTime();
  if (remainingMs <= 0) return 0;
  return Math.ceil(remainingMs / MS_PER_DAY);
}
