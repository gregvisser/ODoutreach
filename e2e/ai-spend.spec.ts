/**
 * Queue item 80 — the AI spend screen must show the money that is actually on
 * the ledger, and it must be owner-only.
 *
 * WHY THIS IS A BROWSER TEST. Cycle 85 wrote the usage ledger and shipped no
 * way to read it, so spend was being recorded and nobody could see what to
 * charge. The fix is a screen — and a screen is exactly the shape of this
 * project's worst recurring defect, because a spend table that renders an empty
 * body looks identical whether the query works, returns nothing, or throws and
 * gets swallowed. QUEUE.md records six things this week that were built, wired,
 * reported success and never fired.
 *
 * So the seed puts NINE ledger rows in the database with deliberately odd,
 * exact figures (see `E2E_AI_SPEND`), and this spec asserts those figures on
 * the rendered page. If the Prisma group-by, the billing fold or the table
 * wiring breaks, the numbers change and this goes red — rather than the table
 * quietly emptying and the walk still passing because an `<h1>` rendered.
 *
 * SEND SAFETY: navigation only. Nothing here submits a form, and the app under
 * test runs with every provider credential blanked (`e2e/env.ts`).
 */
import { expect, test } from "@playwright/test";

import { E2E_AI_SPEND, E2E_CLIENT, E2E_CLIENT_B, E2E_STORAGE_STATE } from "./fixtures";

const A = E2E_AI_SPEND.clientA;
const B = E2E_AI_SPEND.clientB;

test.describe("AI spend — owner view", () => {
  test.use({ storageState: E2E_STORAGE_STATE.superAdmin });

  test("shows what each client owes, read from the usage ledger", async ({ page }) => {
    await page.goto("/settings/ai-spend");

    const main = page.locator("main");
    await expect(main.getByRole("heading", { name: "AI spend", level: 1 })).toBeVisible();

    // The table is populated at all — the first thing that would silently fail.
    const rows = main.getByTestId("ai-spend-client-row");
    await expect(rows).toHaveCount(2);

    // Largest bill first. Both workspaces named, and split — not lumped.
    await expect(rows.nth(0)).toContainText(E2E_CLIENT.name);
    await expect(rows.nth(0).getByTestId("ai-spend-client-cost")).toHaveText(A.displayCost);
    await expect(rows.nth(1)).toContainText(E2E_CLIENT_B.name);
    await expect(rows.nth(1).getByTestId("ai-spend-client-cost")).toHaveText(B.displayCost);

    // The number Greg invoices.
    await expect(main.getByTestId("ai-spend-total-cost")).toHaveText(
      E2E_AI_SPEND.displayTotalCost,
    );
  });

  test("shows refused and failed calls, so a switched-off feature is not mistaken for a quiet one", async ({
    page,
  }) => {
    // Production today has no ANTHROPIC_API_KEY, so every real call refuses. A
    // screen that only counted charged calls would show "0" and read as "the
    // feature is idle" rather than "the feature is being refused 400 times".
    await page.goto("/settings/ai-spend");

    const firstRow = page.locator("main").getByTestId("ai-spend-client-row").nth(0);
    const cells = firstRow.locator("td");

    await expect(cells.nth(1)).toHaveText(String(A.okCalls));
    await expect(cells.nth(2)).toHaveText(String(A.refusedCalls));
    await expect(cells.nth(3)).toHaveText(String(A.errorCalls));
  });

  test("warns that the prices behind the cost column are unverified", async ({ page }) => {
    // The per-token rates have never been checked against the published price
    // list (WebFetch was denied in cycles 85 and 86). Presenting the total as
    // fact would put a guessed number on a real invoice.
    await page.goto("/settings/ai-spend");

    await expect(page.getByTestId("ai-spend-rate-warning")).toContainText(
      "Do not invoice these amounts yet",
    );
  });

  test("a month with no calls says so, rather than looking broken", async ({ page }) => {
    // Far enough back that the seed cannot have written into it.
    await page.goto("/settings/ai-spend?month=2020-01");

    await expect(page.getByTestId("ai-spend-empty")).toContainText("Nothing to invoice");
    await expect(page.locator("main").getByTestId("ai-spend-client-row")).toHaveCount(0);
  });

  test("a hand-typed month falls back to the current bill instead of erroring", async ({
    page,
  }) => {
    const response = await page.goto("/settings/ai-spend?month=not-a-month");

    expect(response?.status()).toBeLessThan(400);
    await expect(page.getByTestId("ai-spend-total-cost")).toHaveText(
      E2E_AI_SPEND.displayTotalCost,
    );
  });
});

test.describe("AI spend — ordinary staff", () => {
  test.use({ storageState: E2E_STORAGE_STATE.staff });

  test("cannot see any client's spend", async ({ page }) => {
    // Cross-client money is the owner's. This screen deliberately does not go
    // through the per-tenant access filter — the super-admin check IS the
    // boundary, so it gets its own assertion rather than being assumed.
    await page.goto("/settings/ai-spend");

    await expect(page.locator("main")).toContainText(
      "Only the owner account can see AI spend across clients",
    );
    await expect(page.getByTestId("ai-spend-client-row")).toHaveCount(0);
    await expect(page.getByTestId("ai-spend-total-cost")).toHaveCount(0);
  });
});
