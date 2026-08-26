import { expect, test } from "@playwright/test";

import { E2E_CLIENT, E2E_STORAGE_STATE } from "./fixtures";

/**
 * Regression for a support ticket: a staff member filling in the (long)
 * client Brief form hit Save and the whole page crashed to the app-wide
 * error boundary, wiping everything they'd typed.
 *
 * Root cause: `onSubmit` awaits `saveClientBriefAction` inside
 * `startTransition` with no try/catch. Per Next's own docs ("Handling
 * uncaught exceptions" — Server Functions), an error thrown by a Server
 * Function call is a rejected promise on the client, and "unhandled errors
 * inside startTransition ... bubble up to the nearest error boundary." That
 * can happen for more than one reason server-side (an expired session, a
 * transient DB blip before the action's own try/catch, a dropped
 * connection) — the fix has to hold for the whole class, not one cause.
 *
 * This test forces the underlying fetch to fail (aborted request) so the
 * failure is deterministic and cause-agnostic, then asserts the page
 * survives with the reporter's data intact.
 */
test.describe("client brief — save request fails", () => {
  test.use({ storageState: E2E_STORAGE_STATE.staff });

  test("a failed save shows an inline error and keeps the typed data, instead of crashing the page", async ({
    page,
  }) => {
    await page.goto(`/clients/${E2E_CLIENT.id}/brief`);

    const website = page.getByLabel("Website");
    await expect(website).toBeVisible();

    const marker = `https://e2e-save-failure-marker-${Date.now()}.example`;
    await website.fill(marker);

    // Force the Save server action's own request to fail on the wire —
    // stands in for any cause (expired session, DB blip, dropped
    // connection) that makes `saveClientBriefAction` reject.
    await page.route(`**/clients/${E2E_CLIENT.id}/brief`, async (route) => {
      if (route.request().method() === "POST") {
        await route.abort("failed");
        return;
      }
      await route.continue();
    });

    await page.getByRole("button", { name: "Save brief" }).click();

    // Must NOT crash to the app-wide error boundary.
    await expect(
      page.getByRole("heading", { name: "Something went wrong on this page" }),
    ).not.toBeVisible();

    // The form must still be there, with the reporter's typed data intact.
    await expect(website).toBeVisible();
    await expect(website).toHaveValue(marker);

    // An inline error should tell them the save didn't go through.
    await expect(page.getByText(/couldn.t save/i)).toBeVisible();
  });
});
