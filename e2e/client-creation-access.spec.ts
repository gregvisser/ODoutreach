import { expect, test } from "@playwright/test";
import { E2E_STORAGE_STATE } from "./fixtures";

test.describe("ordinary OpenDoors staff", () => {
  test.use({ storageState: E2E_STORAGE_STATE.staff });
  test("can use client list but cannot create another workspace", async ({ page }) => {
    await page.goto("/clients");
    await expect(page.getByRole("heading", { name: "Clients", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Add client", exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "New client", exact: true })).toHaveCount(0);
    await page.goto("/clients/new");
    await expect(page.getByText("Only the owner can add a client workspace.", { exact: false })).toBeVisible();
    await expect(page.getByLabel(/Client name/)).toHaveCount(0);
  });
});

test.describe("OpenDoors owner", () => {
  test.use({ storageState: E2E_STORAGE_STATE.superAdmin });
  test("retains the client creation form", async ({ page }) => {
    await page.goto("/clients/new");
    await expect(page.getByRole("heading", { name: "Add a client", exact: true })).toBeVisible();
    await expect(page.getByLabel(/Client name/)).toBeVisible();
  });
});
