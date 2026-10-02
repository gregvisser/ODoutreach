import { expect, test } from "@playwright/test";

import { E2E_CLIENT, E2E_GOOGLE_BADGE, E2E_PAPAYA, E2E_STORAGE_STATE } from "./fixtures";

test.describe("a Papaya member cannot see OpensDoors", () => {
  test.use({ storageState: E2E_STORAGE_STATE.papaya });

  test("the workspace badge, client list, and a direct id stay inside Papaya", async ({ page }) => {
    await page.goto("/clients");
    await expect(page.getByRole("heading", { name: "Choose an organisation" })).toHaveCount(0);
    await expect(page.getByRole("combobox", { name: "Organisation" })).toHaveCount(0);
    await expect(page.getByText(E2E_PAPAYA.name, { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("table").getByText(E2E_PAPAYA.clientName).first()).toBeVisible();
    await expect(page.getByText(E2E_CLIENT.name)).toHaveCount(0);
    await expect(page.getByText(E2E_GOOGLE_BADGE.clientName)).toHaveCount(0);
    await expect(page.getByLabel(/need attention/)).toHaveCount(0);

    await page.goto("/google-reconnects");
    await expect(page.getByText(E2E_GOOGLE_BADGE.email)).toHaveCount(0);
    await expect(page.getByRole("main").getByText("In this organisation", { exact: true }).first()).toBeVisible();

    // The app shell streams a 200 before notFound() runs, so the proof is
    // that OpensDoors' workspace is not rendered.
    await page.goto(`/clients/${E2E_CLIENT.id}`);
    await expect(page.getByRole("heading", { name: E2E_CLIENT.name })).toHaveCount(0);
    await expect(page.getByText(E2E_CLIENT.name)).toHaveCount(0);

    const logo = await page.request.get(`/api/clients/${E2E_CLIENT.id}/logo`);
    expect(logo.status()).toBe(403);
    await page.goto(`/clients/${E2E_PAPAYA.clientId}`);
    await expect(page.getByRole("heading", { name: E2E_PAPAYA.clientName }).first()).toBeVisible();
  });
});

test.describe("someone in several organisations chooses at sign-in", () => {
  test.use({ storageState: E2E_STORAGE_STATE.multiOrg });

  test("the side panel has no organisation switcher", async ({ page }) => {
    await page.goto("/reporting");
    await expect(page.getByRole("heading", { name: "Choose an organisation" })).toBeVisible();
    await expect(page.getByRole("button", { name: "OpensDoors" })).toBeVisible();
    await expect(page.getByRole("button", { name: E2E_PAPAYA.name })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Organisation" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Google logins" })).toHaveCount(0);
  });
});
