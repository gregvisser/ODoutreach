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
 */

import { expect, test } from "@playwright/test";

import {
  E2E_CLIENT,
  E2E_CONTACT,
  E2E_CONTACT_B,
  E2E_OUTBOUND_EMAIL,
  E2E_STORAGE_STATE,
} from "./fixtures";

test.describe("BC-01 tenant isolation", () => {
  test.describe("as a member of Client B only", () => {
    test.use({ storageState: E2E_STORAGE_STATE.memberB });

    test("sees its own contact and not Client A's", async ({ page }) => {
      await page.goto("/contacts");

      // Own data is visible — otherwise this test would pass on a broken page
      // that simply shows nothing at all.
      await expect(page.getByText(E2E_CONTACT_B.email)).toBeVisible();

      // BC-01: the other client's contact must be absent.
      await expect(page.getByText(E2E_CONTACT.email)).toHaveCount(0);
    });

    test("cannot reach Client A's data by forcing the ?client= filter", async ({ page }) => {
      // The README states ?client= is validated against accessible ids. This is
      // the assertion that proves it, rather than trusting the sentence.
      await page.goto(`/contacts?client=${E2E_CLIENT.id}`);
      await expect(page.getByText(E2E_CONTACT.email)).toHaveCount(0);
    });

    test("E-03: gets 404 — not 403 — on Client A's outbound email by id", async ({ page }) => {
      const response = await page.goto(
        `/activity/outbound/${E2E_OUTBOUND_EMAIL.id}`,
      );

      // 403 would confirm the record exists, which is itself a leak.
      expect(
        response?.status(),
        "another client's record must 404, never 403",
      ).toBe(404);
      await expect(page.getByText(E2E_OUTBOUND_EMAIL.subject)).toHaveCount(0);
    });
  });

  test.describe("as a member of Client A only", () => {
    test.use({ storageState: E2E_STORAGE_STATE.memberA });

    test("sees its own contact and not Client B's", async ({ page }) => {
      await page.goto("/contacts");
      await expect(page.getByText(E2E_CONTACT.email)).toBeVisible();
      await expect(page.getByText(E2E_CONTACT_B.email)).toHaveCount(0);
    });
  });
});
