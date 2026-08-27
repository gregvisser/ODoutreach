/**
 * Queue item 27, defect (9) — "/contacts takes 19,265 ms and ships 2,977 KB of
 * HTML", measured in Chrome on the live site on 2026-08-26.
 *
 * The cause is not a slow query. `listContactsForStaff` took 500 rows and the
 * page rendered every one of them, each row carrying a `SendToContactForm` —
 * a client component wrapping a Radix sheet with a subject input and an
 * eight-row textarea. TTFB was 2,865 ms of that 19,265 ms; the other 16.4
 * seconds were the browser parsing and hydrating five hundred of those.
 *
 * So the thing to measure is what the browser is actually handed. A unit test
 * on the query would assert `take: 50` and pass while the page still rendered
 * every row it was given — this repository has shipped six things this week
 * that were built, wired, reported success and never fired, and an assertion
 * about a constant is exactly how that happens. This spec counts the rows that
 * are really painted and weighs the document that really arrives.
 *
 * SEND SAFETY: navigation and paging links only. Nothing here opens a send
 * sheet or submits a form. The app under test runs with every provider
 * credential blanked (`e2e/env.ts`).
 */
import { expect, test, type Page } from "@playwright/test";

import {
  E2E_CONTACT_BULK,
  E2E_CONTACT_BULK_NEEDLE,
  E2E_STORAGE_STATE,
} from "./fixtures";

test.use({ storageState: E2E_STORAGE_STATE.superAdmin });

/** Rows in the Directory table specifically — not the CSV form's markup. */
function directoryRows(page: Page) {
  return page.locator("[data-testid='contacts-directory'] tbody tr");
}

test.describe("/contacts pages the directory instead of dumping it", () => {
  test("one page of contacts is painted, not the whole table", async ({
    page,
  }) => {
    await page.goto("/contacts");

    const rows = directoryRows(page);
    await expect(rows.first()).toBeVisible();
    const painted = await rows.count();

    // Positive control: the bulk seed really landed, so a low row count below
    // means paging, not an empty database. If this fails the rest is noise.
    expect(
      E2E_CONTACT_BULK.count,
      "the bulk contact fixture is too small to have more than one page",
    ).toBeGreaterThan(60);

    expect(
      painted,
      `${painted} contact rows were painted; the whole table is ${E2E_CONTACT_BULK.count}+ rows, so this page is not paged`,
    ).toBeLessThanOrEqual(60);
    expect(painted, "no contact rows were painted at all").toBeGreaterThan(0);
  });

  test("the page says how many contacts there really are", async ({ page }) => {
    await page.goto("/contacts");
    await expect(directoryRows(page).first()).toBeVisible();

    // The /suppression defect in the same walk was a count that claimed to be
    // complete ("Showing 200 of 200" over 30,229 rows). The same sentence
    // helper is reused here, so the total has to come from the database.
    const body = await page.locator("body").innerText();
    const match = body.match(/Showing\s+([\d,]+)[–-]([\d,]+)\s+of\s+([\d,]+)/);

    expect(
      match,
      `no "Showing x-y of z" count on the page — body began:\n${body.slice(0, 600)}`,
    ).not.toBeNull();

    const total = Number(match![3]!.replace(/,/g, ""));
    expect(
      total,
      `the page reports ${total} contacts but at least ${E2E_CONTACT_BULK.count} are seeded — the total is not the real one`,
    ).toBeGreaterThanOrEqual(E2E_CONTACT_BULK.count);
  });

  test("Next reaches contacts that are not on page one", async ({ page }) => {
    await page.goto("/contacts");
    await expect(directoryRows(page).first()).toBeVisible();

    const pageOne = await directoryRows(page).allInnerTexts();
    expect(pageOne.length, "page one is empty").toBeGreaterThan(0);

    await page.getByRole("link", { name: /Next/ }).first().click();
    // Wait for the navigation itself. Without this the rows below can be read
    // off the page-one DOM that is still mounted, which fails as though the
    // offset were being ignored.
    await page.waitForURL(/[?&]from=\d+/);
    await expect(directoryRows(page).first()).toBeVisible();

    const pageTwo = await directoryRows(page).allInnerTexts();
    expect(pageTwo.length, "page two is empty").toBeGreaterThan(0);

    // Paging that returns the same rows is worse than no paging: it looks like
    // it worked. Every row on page two must be new.
    const seen = new Set(pageOne);
    const repeats = pageTwo.filter((r) => seen.has(r));
    expect(
      repeats.length,
      `${repeats.length} of page two's rows also appeared on page one — the offset is not being applied`,
    ).toBe(0);
  });

  test("a contact deep in the set is still reachable, not just hidden", async ({
    page,
  }) => {
    // The cheapest way to "fix" a heavy page is to stop showing the rows. This
    // asserts the opposite: a contact seeded deep in the set can still be
    // found, so paging shrank the page without shrinking the directory.
    await page.goto(
      `/contacts?q=${encodeURIComponent(E2E_CONTACT_BULK_NEEDLE)}`,
    );
    await expect(
      page.getByText(E2E_CONTACT_BULK_NEEDLE, { exact: false }).first(),
      `${E2E_CONTACT_BULK_NEEDLE} is seeded but cannot be found — paging hid it instead of paging it`,
    ).toBeVisible();
  });

  test("the document the browser is handed is not the whole table", async ({
    page,
  }) => {
    // The UX walk's own metric: 2,977 KB of HTML for 500 rows. This is the
    // measurement, printed so a human can read it, with a ceiling that a
    // full-table render cannot pass.
    await page.goto("/contacts");
    await expect(directoryRows(page).first()).toBeVisible();

    const bytes = await page.evaluate(() => {
      const nav = performance.getEntriesByType(
        "navigation",
      )[0] as PerformanceNavigationTiming;
      return nav.decodedBodySize;
    });

    const kb = Math.round(bytes / 1024);
    // The measurement is the deliverable, so it is printed rather than only asserted.
    console.log(`/contacts document: ${kb} KB decoded`);

    expect(
      kb,
      `/contacts shipped ${kb} KB of HTML; a paged directory should be a fraction of the ${E2E_CONTACT_BULK.count}-row dump`,
    ).toBeLessThan(700);
  });
});
