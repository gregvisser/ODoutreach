import { expect, test } from "@playwright/test";
import { E2E_CLIENT, E2E_STORAGE_STATE } from "./fixtures";

test.use({ storageState: E2E_STORAGE_STATE.staff });
test("staff see machine activation unavailable with a Human sending explanation", async ({ page }) => {
  await page.goto(`/clients/${E2E_CLIENT.id}`);
  await expect(page.getByRole("button", { name: "Machine sending", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Human sending", exact: true })).toBeVisible();
  await expect(page.getByText(/Machine sending is not available in this Human sending release/)).toBeVisible();
});
