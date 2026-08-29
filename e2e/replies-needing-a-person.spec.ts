/**
 * Queue item 80 — a "yes, happy to talk" must reach a person, not just a badge.
 *
 * WHY THIS IS A BROWSER TEST. Cycle 85 shipped reply classification and cycle
 * 86 shipped the spend screen; the label itself was rendered only as a coloured
 * badge inside ONE client's Activity tab. Labelling a reply is not routing it,
 * and finding the warm one meant opening thirty-odd workspaces and scanning
 * each. This screen is the routing — and a routing screen is the exact shape of
 * this project's worst recurring defect, because an empty table looks identical
 * whether the query works, returns nothing, or throws and gets swallowed.
 * QUEUE.md records six things this week that were built, wired, reported
 * success and never fired.
 *
 * So the seed puts SEVEN replies in the database — five that must appear, in a
 * stated order, and two that must never appear — and this spec asserts that
 * exact list on the rendered page. If the query, the routing rule or the table
 * wiring breaks, the list changes and this goes red, rather than the table
 * quietly emptying while the screen walk still passes because an `<h1>`
 * rendered.
 *
 * SEND SAFETY: navigation only. Nothing here submits a form, and the app under
 * test runs with every provider credential blanked (`e2e/env.ts`).
 */
import { expect, test } from "@playwright/test";

import { E2E_CLIENT, E2E_REPLIES_WAITING, E2E_STORAGE_STATE } from "./fixtures";

const SHOWN = E2E_REPLIES_WAITING.expectedOrder;

test.describe("Replies waiting for a person", () => {
  test.use({ storageState: E2E_STORAGE_STATE.superAdmin });

  test("lists everyone still waiting, across clients, most urgent first", async ({
    page,
  }) => {
    await page.goto("/replies");

    const main = page.locator("main");
    await expect(
      main.getByRole("heading", { name: "Replies waiting for a person", level: 1 }),
    ).toBeVisible();

    // The table is populated at all — the first thing that would silently fail.
    const rows = main.getByTestId("replies-waiting-row");
    await expect(rows).toHaveCount(SHOWN.length);

    // Bookings first, longest wait first inside each band. This ordering IS the
    // feature: a queue sorted newest-first buries the lead about to go cold.
    await expect(main.getByTestId("replies-waiting-from")).toHaveText(
      SHOWN.map((r) => r.email),
    );
  });

  test("never lists a rejection or an opt-out", async ({ page }) => {
    // Both are seeded and both are recent. A screen that showed them would
    // bury the two people who actually said yes under noise nobody can clear.
    await page.goto("/replies");

    const main = page.locator("main");
    for (const email of E2E_REPLIES_WAITING.excluded) {
      await expect(main.getByText(email)).toHaveCount(0);
    }
  });

  test("still lists a reply the assistant never read", async ({ page }) => {
    /**
     * The assertion that matters most in production TODAY.
     *
     * ANTHROPIC_API_KEY is unset in Azure, so every real reply arrives with a
     * null classification. If null fell out of this queue the screen would be
     * confidently empty while the entire inbox went unrouted — which is
     * precisely the "built, wired, reported success, never fired" defect this
     * file exists to catch.
     */
    await page.goto("/replies");

    const main = page.locator("main");
    const unclassified = SHOWN[3];
    await expect(main.getByText(unclassified.email)).toBeVisible();
    // And it is honest about not having been read, rather than blank.
    await expect(main.getByText("Not checked yet").first()).toBeVisible();
  });

  test("counts the people who want to talk, and the one left too long", async ({
    page,
  }) => {
    await page.goto("/replies");

    const main = page.locator("main");
    await expect(main.getByTestId("replies-want-to-talk")).toHaveText(
      String(E2E_REPLIES_WAITING.wantToTalkCount),
    );
    await expect(main.getByTestId("replies-overdue")).toHaveText(
      String(E2E_REPLIES_WAITING.overdueCount),
    );
    await expect(main.getByTestId("replies-total-waiting")).toHaveText(
      String(SHOWN.length),
    );
  });

  test("says why the top reply is urgent, and links to where it is answered", async ({
    page,
  }) => {
    await page.goto("/replies");

    const firstRow = page.locator("main").getByTestId("replies-waiting-row").first();

    // The model's one-line reason, so a person can triage without opening it.
    await expect(firstRow).toContainText(E2E_REPLIES_WAITING.topRationale);
    // Six hours is past the four-hour threshold for a booking.
    await expect(firstRow).toContainText("Waiting too long");
    // And the row goes somewhere — a queue you cannot act from is a report.
    await expect(firstRow.getByRole("link", { name: "Open reply" })).toHaveAttribute(
      "href",
      new RegExp(`^/clients/${E2E_CLIENT.id}/activity/replies/`),
    );
  });

  test("is reachable from the sidebar, not just by typing the URL", async ({
    page,
  }) => {
    // A queue nobody can find is a queue nobody works — the same reasoning that
    // put the weekly Google reconnect chore in the sidebar.
    await page.goto("/reporting");

    await page.getByRole("link", { name: "Replies to answer" }).first().click();
    await expect(page).toHaveURL(/\/replies$/);
    await expect(
      page.getByRole("heading", { name: "Replies waiting for a person", level: 1 }),
    ).toBeVisible();
  });
});
