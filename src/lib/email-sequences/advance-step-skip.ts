/**
 * An already-sent or empty follow-up step is not a failed cron run.
 * The dispatcher throws this code when the step has no READY rows left.
 */
export const EMPTY_STEP_ADVANCE_CODE = "NO_READY_ROWS";

export function isEmptyAdvanceStep(code: string | undefined): boolean {
  return code === EMPTY_STEP_ADVANCE_CODE;
}
