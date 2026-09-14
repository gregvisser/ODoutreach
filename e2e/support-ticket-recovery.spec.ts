import { test, expect } from "@playwright/test";
import { Pool } from "pg";
import { E2E_DATABASE_URL } from "./env";
import { E2E_STORAGE_STATE } from "./fixtures";
import { assertSafeTestDatabase } from "./safe-database";

test.use({ storageState: E2E_STORAGE_STATE.staff });
test("a lost ticket acknowledgement requires checking the persisted ticket before retry", async ({ page }) => {
  const pool = new Pool({ connectionString: assertSafeTestDatabase(E2E_DATABASE_URL).toString() });
  const title = "Synthetic support acknowledgement check";
  let dropped = 0;
  try {
    await page.route(url => url.pathname === "/support", async route => {
      if (route.request().method() !== "POST") return route.continue();
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      await response.dispose();
      dropped += 1;
      await route.abort("failed");
    });
    await page.goto("/support");
    await page.getByRole("textbox", { name: "Short title", exact: true }).fill(title);
    await page.getByRole("textbox", { name: "What's the issue? (in detail)", exact: true }).fill("Synthetic isolated database check. No external support agent runs here.");
    await page.getByRole("button", { name: "Log ticket", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("We could not confirm whether your ticket was logged.");
    await expect(page.getByRole("button", { name: "Log ticket", exact: true })).toBeDisabled();
    expect(dropped).toBe(1);
    expect((await pool.query('SELECT id FROM "SupportTicket" WHERE title=$1', [title])).rowCount).toBe(1);
    await page.getByRole("link", { name: "Refresh ticket list", exact: true }).click();
    await expect(page.getByRole("link", { name: title, exact: true })).toBeVisible();
  } finally {
    await pool.query('DELETE FROM "SupportTicket" WHERE title=$1', [title]);
    await pool.end();
  }
});
