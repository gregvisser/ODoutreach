import { expect, test } from "@playwright/test";
import { E2E_CLIENT, E2E_STORAGE_STATE } from "./fixtures";

test.use({ storageState: E2E_STORAGE_STATE.staff });
test("staff see machine activation unavailable with a Human sending explanation", async ({ page }) => {
  await page.goto(`/clients/${E2E_CLIENT.id}`);
  await expect(page.getByRole("button", { name: "Machine sending", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Human sending", exact: true })).toBeVisible();
  const explanation = page.getByRole("main").getByText(/Machine sending is not available in this Human sending release/);
  await expect(explanation).toHaveCount(1);
  await expect(explanation).toBeVisible();
  await page.getByRole("link", { name: "Templates", exact: true }).click();
  await page.getByText("Draft emails with AI", { exact: true }).click();
  await expect(page.getByRole("button", { name: "Write a sequence with AI", exact: true })).toBeDisabled();
  await expect(page.getByText(/You can still write, review and schedule emails yourself using Human sending/)).toBeVisible();
  await page.getByRole("link", { name: "Outreach", exact: true }).click();
  for (const name of ["Review with AI", "Work out our best send times", "Compare campaigns by job title"]) {
    await expect(page.getByRole("button", { name, exact: true })).toBeDisabled();
  }
  await page.getByRole("link", { name: "Mailboxes", exact: true }).click();
  await expect(page.getByRole("button", { name: "Compare our senders", exact: true })).toBeDisabled();
});
