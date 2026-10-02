import { expect, test } from "@playwright/test";

import { E2E_STORAGE_STATE } from "./fixtures";

test.describe("platform dashboard", () => {
  test.use({ storageState: E2E_STORAGE_STATE.platformAdmin });

  test("a platform administrator signs in to the platform dashboard, not the workspace", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/platform$/);
    const content = page.getByRole("main");
    await expect(page.getByRole("heading", { name: "Platform", level: 1 })).toBeVisible();
    await expect(page.locator("aside").getByRole("navigation", { name: "Platform" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Reports", exact: true })).toHaveCount(0);
    await expect(content.getByText("OpensDoors")).toBeVisible();
    await expect(content.getByText("Active", { exact: true })).toBeVisible();
    await expect(content.getByText("Members", { exact: true })).toBeVisible();
    await expect(content.getByText("Mailboxes", { exact: true })).toBeVisible();
    await expect(content.getByText("Sends today", { exact: true })).toBeVisible();
    await expect(content.getByText("RocketReach", { exact: true })).toBeVisible();
    await expect(content.getByText("AI spend", { exact: true })).toBeVisible();
    await expect(content.getByText("Health", { exact: true })).toBeVisible();
    await expect(content.getByRole("button", { name: "Enter workspace" })).toBeVisible();
    await expect(content.getByRole("link", { name: "Manage", exact: true })).toBeVisible();
  });

  test("enter workspace opens the organisation, and back returns to the dashboard", async ({
    page,
  }) => {
    await page.goto("/platform");
    await page.getByRole("main").getByRole("button", { name: "Enter workspace" }).click();
    await expect(page).toHaveURL(/\/clients$/);
    const back = page.getByRole("link", { name: "Back to platform dashboard" });
    await expect(back.first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Platform", exact: true })).toHaveCount(0);
    await back.first().click();
    await expect(page).toHaveURL(/\/platform$/);
    await expect(page.getByRole("heading", { name: "Platform", level: 1 })).toBeVisible();
  });

  test("manage organisation stays on the platform shell", async ({ page }) => {
    await page.goto("/platform");
    await page.getByRole("main").getByRole("link", { name: "Manage", exact: true }).click();
    await expect(page).toHaveURL(/\/platform\/org_opensdoors$/);
    await expect(page.getByRole("heading", { name: "OpensDoors", level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "Reports", exact: true })).toHaveCount(0);
    await expect(page.locator("aside").getByRole("navigation", { name: "Platform" })).toBeVisible();
  });
});

test.describe("organisation staff cannot open the platform dashboard", () => {
  test.use({ storageState: E2E_STORAGE_STATE.staff });

  test("a direct visit is not found and the workspace has no platform control", async ({
    page,
  }) => {
    await page.goto("/reporting");
    await expect(page.getByRole("link", { name: "Back to platform dashboard" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Platform", exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Reports", exact: true })).toBeVisible();

    await page.goto("/platform");
    await expect(page.getByRole("heading", { name: "404", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Platform", level: 1 })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Create organisation" })).toHaveCount(0);
  });

  test("signing in still opens Reports", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/reporting$/);
  });
});
