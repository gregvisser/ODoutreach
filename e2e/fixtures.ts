/**
 * Deterministic identities and record ids shared by the e2e seed and the specs.
 *
 * Ids are fixed (not cuids) so a spec can build a URL like
 * `/activity/outbound/<id>` without first querying the database.
 */

/** Super-admin persona — required by `/operations/outbound`, `/activity`, `/contacts`. */
export const E2E_SUPER_ADMIN = {
  entraObjectId: "e2e-oid-super-admin-0000000000001",
  email: "e2e-superadmin@opensdoors.example",
  displayName: "E2E Super Admin",
} as const;

/**
 * Plain active staff — no `isSuperAdmin`. Exists so the RBAC redirects are
 * asserted rather than assumed.
 */
export const E2E_STAFF = {
  entraObjectId: "e2e-oid-staff-00000000000000002",
  email: "e2e-staff@opensdoors.example",
  displayName: "E2E Staff",
} as const;

export const E2E_CLIENT = {
  id: "e2e-client-000000000000000001",
  name: "E2E Test Workspace",
  slug: "e2e-test-workspace",
} as const;

export const E2E_CONTACT = {
  id: "e2e-contact-00000000000000001",
  email: "recipient@example.test",
  fullName: "E2E Recipient",
} as const;

/**
 * Status is deliberately `SENT`: the four `/operations/outbound` queue queries
 * select QUEUED-older-than-30m, stale PROCESSING, FAILED, and BOUNCED. A SENT
 * row matches none of them, so the queue tables stay deterministically empty
 * while the row is still there for the detail-page journey.
 */
export const E2E_OUTBOUND_EMAIL = {
  id: "e2e-outbound-0000000000000001",
  toEmail: "recipient@example.test",
  subject: "E2E fixture subject",
} as const;

export const E2E_STORAGE_STATE = {
  superAdmin: "e2e/.auth/super-admin.json",
  staff: "e2e/.auth/staff.json",
} as const;
