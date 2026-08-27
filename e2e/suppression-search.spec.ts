/**
 * Queue item 27 (7) — the blocked-contacts screen must not lie about how many
 * rows it is showing, and its search must find a blocked address that is not
 * on the page in front of you.
 *
 * This exists as a browser test rather than a unit test because the defect was
 * only visible once the query, the page and the table were assembled. Each
 * layer was individually defensible: the query took 200 rows, the page passed
 * them down, the table printed `rows.length` on both sides of the word "of".
 * Together they told a staff member that a client with 30,229 blocked
 * addresses had 200, and that an address they could not see was not blocked.
 *
 * The seed puts 250 blocked addresses on the E2E workspace.
 * `E2E_SUPPRESSION_NEEDLE` is the alphabetically last one, so it is provably
 * NOT in the first page of 200 — if the search finds it, the search reached
 * the database.
 *
 * ON LOCATOR SCOPING: /suppression is `force-dynamic` and streams. React buffers
 * streamed-in content in a `<div id="S:0" hidden>` at the end of `<body>` before
 * swapping it into place, so for a moment the page's text genuinely exists TWICE
 * and a bare `getByText(...)` fails Playwright's strict mode rather than the
 * assertion. Every locator here is therefore scoped to `<main>`, which the
 * streaming buffer sits outside of. This was diagnosed by dumping the DOM, not
 * guessed at — the earlier symptom looked like a visibility flake.
 *
 * SEND SAFETY: navigation and one GET form submit. Nothing here queues or
 * sends mail, and the app under test runs with every provider credential
 * blanked (`e2e/env.ts`).
 */
import { expect, test, type Page } from "@playwright/test";

import {
  E2E_CLIENT,
  E2E_STORAGE_STATE,
  E2E_SUPPRESSION,
  E2E_SUPPRESSION_NEEDLE,
  e2eSuppressedEmail,
} from "./fixtures";

test.use({ storageState: E2E_STORAGE_STATE.superAdmin });

const PAGE_SIZE = 200;
const TOTAL = E2E_SUPPRESSION.emailCount;
const SUPPRESSION_URL = `/suppression?client=${E2E_CLIENT.id}`;

/** The rendered page, excluding React's hidden streaming buffer. */
function main(page: Page) {
  return page.getByRole("main");
}

/** A count sentence — also the anchor proving the stream has settled. */
function summary(page: Page, text: string) {
  return main(page).getByText(text, { exact: true });
}

/** A blocked address as it appears in the table, not as loose page text. */
function addressCell(page: Page, address: string) {
  return main(page).getByRole("cell", { name: address, exact: true });
}

test.describe("Blocked contacts — honest counts and a search that works", () => {
  test("reports the real total, not the number of rows on screen", async ({
    page,
  }) => {
    await page.goto(SUPPRESSION_URL);

    await expect(
      summary(
        page,
        `Showing 1–${PAGE_SIZE} of ${TOTAL} blocked email addresses.`,
      ),
    ).toBeVisible();

    // The defect, stated exactly: the page used to say "Showing 200 of 200".
    await expect(main(page).getByText("Showing 200 of 200")).toHaveCount(0);

    // ...and it says so plainly when the whole list really is on screen.
    await expect(
      summary(
        page,
        `Showing all ${E2E_SUPPRESSION.domainCount} blocked domains.`,
      ),
    ).toBeVisible();
  });

  test("finds a blocked address that is NOT on the first page", async ({
    page,
  }) => {
    await page.goto(SUPPRESSION_URL);
    await expect(
      summary(
        page,
        `Showing 1–${PAGE_SIZE} of ${TOTAL} blocked email addresses.`,
      ),
    ).toBeVisible();

    // Positive control: prove the needle really is absent before searching, so
    // a passing search cannot be explained by it having been there already.
    await expect(addressCell(page, e2eSuppressedEmail(0))).toBeVisible();
    await expect(addressCell(page, E2E_SUPPRESSION_NEEDLE)).toHaveCount(0);

    await main(page)
      .getByLabel("Search every blocked email address")
      .fill(E2E_SUPPRESSION_NEEDLE);
    await main(page).getByRole("button", { name: "Search" }).first().click();

    // The whole point: an address the browser had never been sent is found.
    await expect(
      summary(page, "1 blocked email address matches your search."),
    ).toBeVisible();
    await expect(addressCell(page, E2E_SUPPRESSION_NEEDLE)).toBeVisible();
  });

  test("pages to the rest of the addresses", async ({ page }) => {
    await page.goto(SUPPRESSION_URL);
    await expect(
      summary(
        page,
        `Showing 1–${PAGE_SIZE} of ${TOTAL} blocked email addresses.`,
      ),
    ).toBeVisible();
    await expect(addressCell(page, E2E_SUPPRESSION_NEEDLE)).toHaveCount(0);

    /*
     * Follow the real "Next" link by its href rather than clicking it. Clicking
     * races Next.js hydration on a cold production build — the anchor is in the
     * DOM before the router is listening, so the click is swallowed perhaps half
     * the time. What this test is about is whether the link points at the right
     * page and whether that page renders the right rows.
     */
    const nextHref = await main(page)
      .getByRole("link", { name: "Next →" })
      .first()
      .getAttribute("href");
    expect(nextHref).toContain(`emailFrom=${PAGE_SIZE}`);
    await page.goto(nextHref!);

    await expect(
      summary(
        page,
        `Showing ${PAGE_SIZE + 1}–${TOTAL} of ${TOTAL} blocked email addresses.`,
      ),
    ).toBeVisible();
    await expect(addressCell(page, E2E_SUPPRESSION_NEEDLE)).toBeVisible();
  });

  test("a search that matches nothing says so without claiming the list is empty", async ({
    page,
  }) => {
    await page.goto(SUPPRESSION_URL);
    await expect(
      summary(
        page,
        `Showing 1–${PAGE_SIZE} of ${TOTAL} blocked email addresses.`,
      ),
    ).toBeVisible();

    await main(page)
      .getByLabel("Search every blocked email address")
      .fill("nobody-by-this-name@e2e-suppression.test");
    await main(page).getByRole("button", { name: "Search" }).first().click();

    await expect(
      summary(page, "No blocked email addresses match your search."),
    ).toBeVisible();
    // The domain table beside it must be untouched by the email search.
    await expect(
      summary(
        page,
        `Showing all ${E2E_SUPPRESSION.domainCount} blocked domains.`,
      ),
    ).toBeVisible();
  });
});
