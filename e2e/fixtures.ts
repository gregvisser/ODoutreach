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

/**
 * Bulk contacts for /contacts (queue item 27, defect 9).
 *
 * Measured in Chrome on the live site 2026-08-26: /contacts took 19,265 ms to
 * load and shipped 2,977 KB of HTML, because `listContactsForStaff` takes 500
 * rows and the page renders every one of them — each row carrying a
 * `SendToContactForm`, which is a client component. The page had no paging and
 * no total.
 *
 * 260 is chosen to sit just over any sane page size while staying cheap to seed:
 * it is more than one page, so a page-one render provably cannot contain the
 * last contact, and it is well under the old 500 cap, so the OLD code renders
 * all 260 in one go and the spec can measure the difference.
 */
export const E2E_CONTACT_BULK = {
  count: 260,
} as const;

/**
 * The bulk contacts get their OWN workspace, and that is not tidiness.
 *
 * The first draft seeded them into `E2E_CLIENT`, and the existing journey
 * "the compose sheet opens without sending" went red: it opens
 * `/contacts?client=<E2E_CLIENT>` and expects `E2E_CONTACT` to be on screen,
 * and 260 newer contacts had pushed it off page one. The right response to an
 * existing spec failing is to stop changing what it was testing — not to edit
 * it — so the volume lives somewhere the other specs never look. The
 * unfiltered /contacts a super admin lands on still has more than one page,
 * which is all this fixture is for.
 */
export const E2E_CLIENT_BULK = {
  id: "e2e-client-000000000000000003",
  name: "E2E Bulk Directory Workspace",
  slug: "e2e-bulk-directory",
} as const;

/** Zero-padded so alphabetical order and numeric order are the same. */
export function e2eBulkContactEmail(index: number): string {
  return `bulk-${String(index).padStart(4, "0")}@e2e-contacts.test`;
}

/**
 * Fixed ids, so re-seeding is idempotent. `Contact` has no unique constraint on
 * (clientId, email), so a `createMany({ skipDuplicates })` keyed on nothing adds
 * a fresh 260 rows every run — the first draft of this fixture did exactly that
 * and the spec measured 524 rows on one run and 262 on the next. Keying on the
 * primary key makes the seed mean the same thing every time.
 */
export function e2eBulkContactId(index: number): string {
  return `e2e-bulk-contact-${String(index).padStart(11, "0")}`;
}

/**
 * The last contact alphabetically. `listContactsForStaff` orders by
 * `updatedAt desc`, so the spec seeds these in index order and this one is the
 * NEWEST — which puts it FIRST under that ordering and last under an
 * alphabetical one. The spec therefore pins its expectation to the rendered
 * ROW COUNT rather than to which row is where, and uses this only as a
 * positive control that the bulk seed really landed.
 */
export const E2E_CONTACT_BULK_NEEDLE = e2eBulkContactEmail(
  E2E_CONTACT_BULK.count - 1,
);

/**
 * Sending mailboxes for /clients/[id]/mailboxes (queue item 27, defect 6).
 *
 * Deliberately shaped like the live opensdoors workspace measured on
 * 2026-08-26: FOUR connected Microsoft mailboxes that all carry a full branded
 * signature — so `getOperatorSignatureState` returns the same `ready_od`
 * template for every one of them, and the table printed the identical ~50-word
 * paragraph four times — plus ONE that never connected, whose advice really is
 * different and must survive. A fixture where every row is identical would pass
 * even if the fix wrongly hoisted advice that belongs to a single row.
 *
 * SEND SAFETY: `connectionStatus: CONNECTED` is a display state only. No
 * `MailboxIdentitySecret` row is seeded, so `sendViaConnectedMailboxOrFail` has
 * no token and fails closed; the app under test also runs with every provider
 * credential blanked (`e2e/env.ts`), and no spec submits a send.
 */
const E2E_SIGNATURE_HTML =
  "<p>Kind regards,<br/>E2E Sender<br/>E2E Test Workspace<br/>Something long enough to count as a full branded signature.</p>";

export const E2E_MAILBOXES = [
  { id: "e2e-mailbox-0000000000000001", email: "sender-one@example.test", connected: true },
  { id: "e2e-mailbox-0000000000000002", email: "sender-two@example.test", connected: true },
  { id: "e2e-mailbox-0000000000000003", email: "sender-three@example.test", connected: true },
  { id: "e2e-mailbox-0000000000000004", email: "sender-four@example.test", connected: true },
  { id: "e2e-mailbox-0000000000000005", email: "sender-offline@example.test", connected: false },
] as const;

/** The signature HTML every connected fixture mailbox carries. */
export const E2E_MAILBOX_SIGNATURE_HTML = E2E_SIGNATURE_HTML;

/** How many of the fixtures are connected — the count the hoisted advice names. */
export const E2E_CONNECTED_MAILBOX_COUNT = E2E_MAILBOXES.filter(
  (m) => m.connected,
).length;

export const E2E_STORAGE_STATE = {
  superAdmin: "e2e/.auth/super-admin.json",
  staff: "e2e/.auth/staff.json",
  memberA: "e2e/.auth/member-a.json",
  memberB: "e2e/.auth/member-b.json",
} as const;
