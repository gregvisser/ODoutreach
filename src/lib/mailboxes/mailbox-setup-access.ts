/**
 * Internal proof send, signature editors, and advanced mailbox diagnostics.
 *
 * Roles were removed (2026-06): this bundle was previously ADMIN/MANAGER-only
 * (never available to operators/viewers), so it maps to the surviving elevated
 * capability — the per-account isSuperAdmin ("owner"). Everyday outreach staff
 * keep the read-only mailbox view; the owner keeps setup + diagnostics.
 */
export function canAccessMailboxSetupTools(staff: {
  isSuperAdmin: boolean;
}): boolean {
  return staff.isSuperAdmin;
}
