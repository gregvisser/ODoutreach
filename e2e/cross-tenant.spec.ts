/**
 * BC-01 — Tenant isolation.  Spec: specs/BC-01-tenant-isolation.md
 *
 * The highest-value test in this codebase, and it did not exist.
 *
 * The existing personas cannot test isolation: the super admin sees everything by
 * design, and plain staff hold no ClientMembership so they see nothing. The case
 * where a leak actually happens is the one in between — a staff user who is a member
 * of exactly ONE client. E2E_MEMBER_A and E2E_MEMBER_B are that case.
 *
 * Isolation here is enforced in application code (getAccessibleClientIds /
 * requireClientAccess), not by the database. One missed `where` clause is a leak, and
 * this file is the only thing that would tell you.
 *
 * WHEN ROW-LEVEL SECURITY IS ADDED: this test must still pass with RLS on — and then
 * must STILL pass when the application filter is deliberately broken, because the
 * database is refusing. That second run is the only way to tell an enforcing policy
 * from an inert one. See bidlow-verify references/04-the-harness.md.
 *
 * ---------------------------------------------------------------------------
 * THIS FILE IS RED, AND IT IS RED FOR THE RIGHT REASON.  Run 2026-08-22.
 *
 * `getAccessibleClientIds` (src/server/tenant/access.ts) discards its `staff`
 * argument and returns EVERY live client. ClientMembership is never consulted on
 * any read path, so every active staff account can open every workspace. That is
 * deliberate and documented in that file's own docstring — the product was built
 * as an internal OpensDoors tool where all staff are one company. It is not a
 * missed `where` clause; it is the design, and BC-01 asserts a property the
 * system does not currently have.
 *
 * Do not "fix" this file to make it green. It goes green when isolation is built.
 *
 * Three corrections were made after the first run, so that the failures are the
 * spec's and not the test's own:
 *
 *  1. THE ROUTE. The first draft used `/contacts` — a legacy super-admin surface
 *     that redirects every non-super-admin to `/universe` before any tenant filter
 *     is consulted (src/app/(app)/contacts/page.tsx). A member never reached the
 *     assertion, so the `?client=` case PASSED without exercising anything. That
 *     false green is exactly what the spec warns about.
 *
 *  2. THE SURFACE. `/clients/<id>/contacts` renders contact LISTS, not contact
 *     addresses, so it cannot carry the spec's `recipient@example.test` rows. The
 *     workspace overview carries the workspace identity, and the activity feed
 *     carries real prospect addresses and subject lines — so those are used, which
 *     is also where a leak does the most damage.
 *
 *  3. THE E-03 ASSERTION. The first draft asserted `response.status() === 404`.
 *     `src/app/(app)/loading.tsx` makes these segments stream, so Next.js flushes
 *     the 200 shell BEFORE the page's async authorization check runs, and
 *     `notFound()` renders into an already-committed response. A CORRECT
 *     implementation also returns 200, so a status assertion can neither pass on
 *     success nor fail only on a leak. E-03's actual subject — "a 403 confirms the
 *     record exists, which is itself a leak" — is about DISCLOSURE, so disclosure
 *     is what is asserted.
 * ---------------------------------------------------------------------------
 */

import { expect, test } from "@playwright/test";

import {
  E2E_CLIENT,
  E2E_CLIENT_B,
  E2E_CONTACT,
  E2E_OUTBOUND_EMAIL,
  E2E_STORAGE_STATE,
} from "./fixtures";

test.describe("BC-01 tenant isolation", () => {
  test.describe("as a member of Client B only", () => {
    test.use({ storageState: E2E_STORAGE_STATE.memberB });

    // Positive control. Without this, every assertion below would also pass on a
    // blank page, and the file would prove nothing.
    test("sees its own workspace", async ({ page }) => {
      await page.goto(`/clients/${E2E_CLIENT_B.id}`);
      await expect(page.getByText(E2E_CLIENT_B.name).first()).toBeVisible();
    });

    test("cannot open Client A's workspace by forcing the id in the URL", async ({
      page,
    }) => {
      // Walking straight into another workspace by id is the cheapest possible
      // attack, so it gets its own case rather than being implied by a list.
      await page.goto(`/clients/${E2E_CLIENT.id}`);
      await expect(page.getByText(E2E_CLIENT.name)).toHaveCount(0);
    });

    test("E-03: Client A's activity feed discloses no prospect data", async ({
      page,
    }) => {
      // The spec's "explicitly NOT covered" list names this class of gap:
      // permission enforced in the list view and forgotten elsewhere. This is
      // the feed that carries real prospect addresses and real subject lines.
      await page.goto(`/clients/${E2E_CLIENT.id}/activity`);
      await expect(page.getByText(E2E_CONTACT.email)).toHaveCount(0);
      await expect(page.getByText(E2E_OUTBOUND_EMAIL.subject)).toHaveCount(0);
    });

    test("E-03: Client A's outbound email by id discloses nothing", async ({
      page,
    }) => {
      await page.goto(`/activity/outbound/${E2E_OUTBOUND_EMAIL.id}`);
      await expect(page.getByText(E2E_OUTBOUND_EMAIL.subject)).toHaveCount(0);
      await expect(page.getByText(E2E_OUTBOUND_EMAIL.toEmail)).toHaveCount(0);
      await expect(page.getByText(E2E_CLIENT.name)).toHaveCount(0);
    });
  });

  test.describe("as a member of Client A only", () => {
    test.use({ storageState: E2E_STORAGE_STATE.memberA });

    test("sees its own workspace and not Client B's", async ({ page }) => {
      await page.goto(`/clients/${E2E_CLIENT.id}`);
      await expect(page.getByText(E2E_CLIENT.name).first()).toBeVisible();
      await expect(page.getByText(E2E_CLIENT_B.name)).toHaveCount(0);
    });
  });
});
