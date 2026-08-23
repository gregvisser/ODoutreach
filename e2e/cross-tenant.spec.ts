/**
 * BC-01 — Workspace data isolation.  Spec: specs/BC-01-tenant-isolation.md
 *
 * REWRITTEN 2026-08-23, after the spec was. The first version asserted that
 * STAFF are scoped to particular clients. They are not, and deliberately so:
 * OpensDoors is an agency whose staff run outreach across all of its customers,
 * so `getAccessibleClientIds` returning every live client is the design. Those
 * tests were red for a reason nobody was ever going to fix.
 *
 * What replaces them is the half of the old rule that was never tested, and is
 * the half that matters: a record belongs to exactly one workspace, and no
 * operation on one workspace may read, count or send to another's.
 *
 * A staff member reading a list they were always allowed to read is awkward.
 * Emailing Client B's prospects on Client A's behalf is an incident.
 *
 * HONESTY NOTE, required by the red-then-green rule. These did NOT go red
 * first, and that is reported rather than hidden: the send path already carries
 * defence in depth (loader scoping in send-introduction.ts, plus four
 * clientId guards in sequence-send-policy.ts that are already unit-tested), and
 * the read paths are already clientId-scoped. What was missing was any proof
 * of the boundary through the running application. These tests were instead
 * shown to be capable of failing by breaking the boundary deliberately in a
 * scratch branch — see the session record in .bidlow/STATE.md.
 */

import { expect, test } from "@playwright/test";

import {
  E2E_CLIENT,
  E2E_CLIENT_B,
  E2E_CONTACT,
  E2E_CONTACT_B,
  E2E_OUTBOUND_EMAIL,
  E2E_STORAGE_STATE,
} from "./fixtures";

test.describe("BC-01 workspace data isolation", () => {
  // Any active staff member may open either workspace — that is the recorded
  // access decision, not a violation. The persona is therefore incidental here:
  // what is under test is whether the DATA stays separated once they look.
  test.describe("signed in as staff", () => {
    test.use({ storageState: E2E_STORAGE_STATE.memberB });

    test("R-5 positive control: Client A's activity shows Client A's own send", async ({
      page,
    }) => {
      // Without this, every assertion below would also pass on a page that
      // rendered nothing at all, and the file would prove nothing.
      //
      // Asserted as DOM PRESENCE, not visibility, and deliberately so. The
      // activity feed lives inside a collapsed `<details>` (activity/page.tsx
      // is only `open` when mode === "all"), so the rows are in the DOM but not
      // painted. That is the correct property to test anyway: data delivered to
      // another workspace's browser is disclosed whether or not CSS happens to
      // be showing it. Every negative assertion in this file is `toHaveCount(0)`
      // for the same reason, so the control is its exact mirror.
      await page.goto(`/clients/${E2E_CLIENT.id}/activity`);
      await expect(page.getByText(E2E_CONTACT.email)).not.toHaveCount(0);
      await expect(page.getByText(E2E_OUTBOUND_EMAIL.subject)).not.toHaveCount(0);
    });

    test("R-5: Client B's activity counts none of Client A's send", async ({ page }) => {
      await page.goto(`/clients/${E2E_CLIENT_B.id}/activity`);
      await expect(page.getByText(E2E_CONTACT.email)).toHaveCount(0);
      await expect(page.getByText(E2E_OUTBOUND_EMAIL.subject)).toHaveCount(0);
    });

    test("R-1: Client A's records do not contain Client B's contact", async ({ page }) => {
      await page.goto(`/clients/${E2E_CLIENT.id}/activity`);
      await expect(page.getByText(E2E_CONTACT_B.email)).toHaveCount(0);
    });

    // R-6. NOTE ON STATUS CODES: `src/app/(app)/loading.tsx` makes these
    // segments stream, so Next.js flushes a 200 shell BEFORE the page's async
    // lookup runs, and `notFound()` renders into an already-committed
    // response. A CORRECT implementation also returns 200, so asserting on
    // status would be asserting on the framework, not on isolation. R-6 is
    // about DISCLOSURE — that no record is ever rendered — so that is what is
    // asserted.
    test("R-6: an unresolvable workspace id discloses no workspace", async ({ page }) => {
      await page.goto("/clients/does-not-exist-000000000000");
      await expect(page.getByText(E2E_CLIENT.name)).toHaveCount(0);
      await expect(page.getByText(E2E_CLIENT_B.name)).toHaveCount(0);
    });

    test("R-6: an unresolvable outbound id discloses no email", async ({ page }) => {
      await page.goto("/activity/outbound/does-not-exist-000000000000");
      await expect(page.getByText(E2E_OUTBOUND_EMAIL.subject)).toHaveCount(0);
      await expect(page.getByText(E2E_OUTBOUND_EMAIL.toEmail)).toHaveCount(0);
    });
  });

  test.describe("E-03 — the authentication wall, which is the one that holds", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("an unauthenticated visitor is sent to sign-in, not into a workspace", async ({
      page,
    }) => {
      await page.goto(`/clients/${E2E_CLIENT.id}/activity`);
      await expect(page).toHaveURL(/\/sign-in/);
      await expect(page.getByText(E2E_CONTACT.email)).toHaveCount(0);
      await expect(page.getByText(E2E_OUTBOUND_EMAIL.subject)).toHaveCount(0);
    });
  });
});
