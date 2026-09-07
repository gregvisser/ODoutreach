import { expect, test } from "@playwright/test";
import { E2E_CLIENT, E2E_STORAGE_STATE } from "./fixtures";

test.use({ storageState: E2E_STORAGE_STATE.staff, trace: "retain-on-failure" });
test("brief cannot accept edits or save until its handlers are ready", async ({ page }) => {
  let release!: () => void;
  const ready = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/_next/static/chunks/**", async (route) => {
    await ready;
    await route.continue();
  });
  const website = page.getByLabel("Website");
  const save = page.getByRole("button", { name: "Save brief" });
  try {
    await page.goto(`/clients/${E2E_CLIENT.id}/brief`, { waitUntil: "commit" });
    await expect(website).toBeVisible();
    await expect(website).toBeDisabled();
    await expect(save).toBeDisabled();
  } finally {
    release();
  }
  await expect(website).toBeEnabled();
  await expect(save).toBeEnabled();
  const marker = "https://brief-ready.example";
  await website.fill(marker);
  await page.route(`**/clients/${E2E_CLIENT.id}/brief`, async (route) => {
    if (route.request().method() === "POST") await route.abort("failed");
    else await route.continue();
  });
  await save.click();
  await expect(page.getByText(/couldn.t save/i)).toBeVisible();
  await expect(website).toHaveValue(marker);
});
