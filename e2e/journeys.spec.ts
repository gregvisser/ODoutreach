import { test, expect } from "@playwright/test";

// Authenticated critical journeys. These need a signed-in browser state — see
// e2e/README.md for the storageState / global-setup approach. Marked `fixme`
// until that auth fixture is wired, so CI stays green in the meantime.
test.describe("authenticated journeys", () => {
  test.fixme("dashboard loads for a signed-in user", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading").first()).toBeVisible();
  });

  test.fixme("create an email sequence", async ({ page }) => {
    await page.goto("/email");
    // TODO: click "New sequence", add steps, save, assert it appears in the list.
  });

  test.fixme("queue / send an outbound campaign", async ({ page }) => {
    await page.goto("/operations/outbound");
    // TODO: select recipients, trigger send/queue, assert queued state + no errors.
  });

  test.fixme("handle a reply in activity", async ({ page }) => {
    await page.goto("/activity/outbound");
    // TODO: open a thread, assert the reply UI renders and an action can be taken.
  });
});
