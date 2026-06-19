/**
 * Internal proof send, signature editors, and advanced mailbox diagnostics.
 *
 * 2026-06-19: the OpensDoors team operates the whole system, so mailbox setup
 * tools are available to every active staff member (the page already gates on
 * "registered active staff"). Kept as a function so callers + the
 * showMailboxSetupTools flag stay stable.
 */
export function canAccessMailboxSetupTools(staff: {
  isSuperAdmin: boolean;
}): boolean {
  void staff;
  return true;
}
