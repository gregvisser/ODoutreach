import { test, expect } from "@playwright/test";
import { E2E_CLIENT, E2E_STORAGE_STATE } from "./fixtures";
test.use({ storageState: E2E_STORAGE_STATE.memberA, viewport: { width: 390, height: 844 } });
test("ordinary staff open candidate review through Sources without triggering research", async ({ page }) => {
  await page.goto(`/clients/${E2E_CLIENT.id}/sources`);
  await page.getByRole("link", { name: "Review research candidates", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/clients/${E2E_CLIENT.id}/research-review$`));
  await expect(page.getByRole("heading", { name: "Research candidates", exact: true })).toBeVisible();
  await expect(page.getByText("No research candidates on this page.", { exact: true })).toBeVisible();
  await expect(page.getByText("This page does not import contacts or send emails. Acceptance and automatic research are not yet available.", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Refresh current checks", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Research candidates", exact: true })).toBeVisible();
});
