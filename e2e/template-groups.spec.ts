import { expect, test } from "@playwright/test";
import { E2E_LAUNCH_CLIENT, E2E_STORAGE_STATE } from "./fixtures";

test.use({ storageState: E2E_STORAGE_STATE.superAdmin, viewport: { width: 390, height: 844 } });
test("template groups expand and open the correct email editor on mobile", async ({ page }) => {
  await page.goto(`/clients/${E2E_LAUNCH_CLIENT.id}/outreach`);
  await page.getByRole("link", { name: "Templates", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/clients/${E2E_LAUNCH_CLIENT.id}/templates$`));
  const group = page.locator("#sequence-template-structure details").first();
  await expect(group).not.toHaveAttribute("open", "");
  await group.locator("summary").click();
  await expect(group).toHaveAttribute("open", "");
  const editor = group.getByRole("link", { name: "Open email editor", exact: true }).first();
  const href = await editor.getAttribute("href");
  const templateId = new URL(href!, "http://localhost").searchParams.get("templateId");
  await expect(editor).toBeVisible();
  await editor.click();
  await expect(page).toHaveURL(new RegExp(`templateId=${templateId}`));
  await expect(page.getByRole("heading", { name: "Edit template", exact: true })).toBeVisible();
  await expect(page.locator('input[name="templateId"]', { has: undefined }).first()).toHaveValue(templateId!);
});
