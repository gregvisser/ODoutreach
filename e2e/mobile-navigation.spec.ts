import { expect, test } from "@playwright/test";

import { E2E_STORAGE_STATE } from "./fixtures";

// Navigation only, using synthetic staff identity and the isolated database.
test.use({
  storageState: E2E_STORAGE_STATE.staff,
  viewport: { width: 390, height: 844 },
});

test("staff navigation reveals the destination and can be reopened", async ({
  page,
}) => {
  await page.goto("/reporting");
  await page.getByRole("button", { name: "Open menu" }).click();
  const menu = page.getByRole("dialog", { name: "Navigation" });
  await expect(menu).toBeVisible();
  await expect(
    menu.getByRole("link", { name: "New client", exact: true }),
  ).toHaveCount(0);
  await menu.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(menu).toBeHidden();
  await expect(
    page
      .getByRole("main")
      .getByRole("heading", { name: "Settings", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open menu" }).click();
  await expect(menu).toBeVisible();
  await menu.getByRole("link", { name: "Reports", exact: true }).click();
  await expect(page).toHaveURL(/\/reporting$/);
  await expect(menu).toBeHidden();
});

test("mobile home link and current-page link both dismiss navigation", async ({
  page,
}) => {
  await page.goto("/settings");
  const menu = page.getByRole("dialog", { name: "Navigation" });
  await page.getByRole("button", { name: "Open menu" }).click();
  await menu.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(menu).toBeHidden();
  await page.getByRole("button", { name: "Open menu" }).click();
  await menu.getByRole("link", { name: /Outreach home/ }).click();
  await expect(page).toHaveURL(/\/reporting$/);
  await expect(menu).toBeHidden();
});
