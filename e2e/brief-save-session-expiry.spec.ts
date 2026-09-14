import { expect, test } from "@playwright/test";

import { E2E_CLIENT, E2E_STORAGE_STATE } from "./fixtures";

test.use({ trace: "retain-on-failure" });

/** A lost save acknowledgement must preserve entries and report an unknown outcome. */
test.describe("client brief — save request fails", () => {
  test.describe.configure({ retries: 0 });
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
    await page.route(`**/api/clients/${E2E_CLIENT.id}/brief`, async (route) => {
      if (route.request().method() === "POST") {
        await route.abort("failed");
        return;
      }
      await route.continue();
    });

    await Promise.all([
      page.waitForRequest((request) => request.method() === "POST" && new URL(request.url()).pathname === `/api/clients/${E2E_CLIENT.id}/brief`),
      page.getByRole("button", { name: "Save brief" }).click(),
    ]);

    // Must NOT crash to the app-wide error boundary.
    await expect(
      page.getByRole("heading", { name: "Something went wrong on this page" }),
    ).not.toBeVisible();

    // The form must still be there, with the reporter's typed data intact.
    await expect(website).toBeVisible();
    await expect(website).toHaveValue(marker);

    // The UI must not claim that an unconfirmed save definitely failed.
    await expect(page.getByText(/could not confirm the save/i)).toBeVisible();
  });
});
