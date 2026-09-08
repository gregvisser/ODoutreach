import { test, expect } from "@playwright/test";
import { Pool } from "pg";
import { E2E_DATABASE_URL } from "./env";
import { E2E_CLIENT, E2E_STORAGE_STATE } from "./fixtures";
import { assertSafeTestDatabase } from "./safe-database";
test.use({ storageState: E2E_STORAGE_STATE.memberA });
// These two checks share one synthetic directory fixture.
test.describe.configure({ mode: "default" });
let pool: Pool;
test.beforeAll(async () => {
  pool = new Pool({ connectionString: assertSafeTestDatabase(E2E_DATABASE_URL).toString() });
  for (let i=0;i<61;i++) await pool.query('INSERT INTO "ContactUniverse" (id,"fullName",industry,"updatedAt") VALUES ($1,$2,$3,NOW())', [`e2e-industry-${i}`,`E2E industry prospect ${String(i).padStart(3,"0")}`, i<31 ? "Accounting & Accounting Services" : "Mining"]);
});
test.afterAll(async () => {
  await pool?.query('DELETE FROM "ContactUniverse" WHERE id LIKE \'e2e-industry-%\'');
  await pool?.end();
});
test("staff filter all stored industries and preserve the filter on later pages and reload", async ({page}) => {
  await page.goto('/universe?q=E2E+industry+prospect&sort=name&page=2');
  await page.getByLabel("Industry contains").fill("accounting");
  await page.getByRole("button",{name:"Apply filters"}).click();
  await expect(page).toHaveURL(/industry=accounting/);
  await expect(page).toHaveURL(/page=1/);
  await expect(page.getByText("Page 1 of 2",{exact:true})).toBeVisible();
  await expect(page.getByRole("table").getByRole("row")).toHaveCount(26);
  await page.getByRole("button",{name:"Next",exact:true}).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.getByRole("table").getByRole("row")).toHaveCount(7);
  await page.reload();
  await expect(page.getByLabel("Industry contains")).toHaveValue("accounting");
  // A streamed reload can retain hidden cells while the active table appears.
  // Assert the accessible table, still rejecting duplicate visible matches.
  await expect(page.getByRole("table").getByRole("row")).toHaveCount(7);
  await expect(page.getByRole("cell",{name:"E2E industry prospect 030",exact:true})).toBeVisible();
  await expect(page.getByRole("cell",{name:"E2E industry prospect 031",exact:true})).toHaveCount(0);
  await page.getByLabel("Industry contains").fill("no such industry");
  await page.getByRole("button",{name:"Apply filters"}).click();
  await expect(page.getByText(/No contacts match these filters yet/)).toBeVisible();
});
test("staff can select a documented industry on mobile without starting a paid import", async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto(`/clients/${E2E_CLIENT.id}/sources`);
  const select=page.getByLabel("Industry (optional)");
  await select.selectOption("Accounting & Accounting Services");
  await expect(select).toHaveValue("Accounting & Accounting Services");
  await expect(page.getByRole("button",{name:"Search and import",exact:true})).toBeDisabled();
});
