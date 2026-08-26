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

/**
 * ---------------------------------------------------------------------------
 * Cross-tenant isolation fixtures. Ported from the BOutreach fork 2026-08-20.
 *
 * The existing personas cannot test isolation: the super admin sees everything
 * by design, and plain staff hold no ClientMembership so they see nothing. The
 * case where a leak actually happens is the one in between - a staff user who is
 * a member of exactly ONE client. These two personas are that case.
 * ---------------------------------------------------------------------------
 */

/** A second workspace. Nothing in it may ever be visible from Client A. */
export const E2E_CLIENT_B = {
  id: "e2e-client-000000000000000002",
  name: "E2E Second Workspace",
  slug: "e2e-second-workspace",
} as const;

/** Staff member of Client A only. */
export const E2E_MEMBER_A = {
  entraObjectId: "e2e-oid-member-a-000000000000003",
  email: "e2e-member-a@opensdoors.example",
  displayName: "E2E Member A",
} as const;

/** Staff member of Client B only. The one who must never see Client A data. */
export const E2E_MEMBER_B = {
  entraObjectId: "e2e-oid-member-b-000000000000004",
  email: "e2e-member-b@opensdoors.example",
  displayName: "E2E Member B",
} as const;

/** A contact belonging to Client B, so each side has something of its own. */
export const E2E_CONTACT_B = {
  id: "e2e-contact-00000000000000002",
  email: "recipient-b@example.test",
  fullName: "E2E Recipient B",
} as const;

/**
 * Blocked-contact fixtures for /suppression (queue item 27, part 7).
 *
 * The count is deliberately larger than one page (200). Before the fix the page
 * loaded an arbitrary 200 rows, printed "Showing 200 of 200", and searched only
 * those rows in the browser — so an address that was genuinely blocked but not
 * in the window was reported as not blocked. `needle` is the alphabetically
 * LAST address, which is therefore guaranteed not to be on the first page: if
 * the search can find it, the search is running in the database.
 */
export const E2E_SUPPRESSION = {
  sourceId: "e2e-suppression-src-0000000001",
  domainSourceId: "e2e-suppression-src-0000000002",
  emailCount: 250,
  domainCount: 3,
} as const;

/** Zero-padded so alphabetical order and numeric order are the same. */
export function e2eSuppressedEmail(index: number): string {
  return `blocked-${String(index).padStart(3, "0")}@e2e-suppression.test`;
}

/** The last address alphabetically — never on page one of 200. */
export const E2E_SUPPRESSION_NEEDLE = e2eSuppressedEmail(
  E2E_SUPPRESSION.emailCount - 1,
);

export const E2E_STORAGE_STATE = {
  superAdmin: "e2e/.auth/super-admin.json",
  staff: "e2e/.auth/staff.json",
  memberA: "e2e/.auth/member-a.json",
  memberB: "e2e/.auth/member-b.json",
} as const;
