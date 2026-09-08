import { test, expect } from "@playwright/test";
import { Pool } from "pg";
import { E2E_DATABASE_URL } from "./env";
import { E2E_MEMBER_A, E2E_STORAGE_STATE } from "./fixtures";
import { assertSafeTestDatabase } from "./safe-database";

test.describe.configure({ mode: "serial", retries: 0 });
test.use({ storageState: E2E_STORAGE_STATE.memberA, viewport: { width: 390, height: 844 } });
const clientId = "e2e-company-sheet-only", sheetId = "synthetic_spreadsheet_identifier_000001";
const url = `/clients/${clientId}/suppression`;
let pool: Pool;
test.beforeAll(async () => {
  pool = new Pool({ connectionString: assertSafeTestDatabase(E2E_DATABASE_URL).toString() });
  await pool.query('INSERT INTO "Client" (id,name,slug,"inboundIngestToken",status,"updatedAt") VALUES ($1,$2,$1,$1,\'ACTIVE\',NOW())', [clientId, "Synthetic company-sheet client"]);
});
test.beforeEach(async () => {
  await pool.query('DELETE FROM "CompanyDncSheetSource" WHERE "clientId"=$1', [clientId]);
  await pool.query('DELETE FROM "AuditLog" WHERE "clientId"=$1', [clientId]);
});
test.afterAll(async () => { await pool?.query('DELETE FROM "Client" WHERE id=$1', [clientId]); await pool?.end(); });

test("ordinary staff save a sheet connection and see the persisted result on mobile", async ({ page }) => {
  await page.goto(url);
  const panel = page.getByRole("region", { name: "Company-name Google Sheet", exact: true });
  await expect(panel.getByRole("button", { name: "Sync company names now" })).toBeDisabled();
  await panel.getByLabel("Company Sheet URL", { exact: true }).fill(sheetId);
  await panel.getByRole("button", { name: "Save company sheet" }).click();
  await expect(panel.getByRole("status")).toContainText("Connection saved");
  await expect(panel.getByRole("button", { name: "Sync company names now" })).toBeEnabled();
  const saved = await pool.query('SELECT "spreadsheetId","tabName","lastSuccessAt" FROM "CompanyDncSheetSource" WHERE "clientId"=$1', [clientId]);
  expect(saved.rows).toEqual([{ spreadsheetId: sheetId, tabName: "Sheet1", lastSuccessAt: null }]);
  const audit = await pool.query('SELECT s."entraObjectId",s."isSuperAdmin" FROM "AuditLog" a JOIN "StaffUser" s ON s.id=a."staffUserId" WHERE a."clientId"=$1', [clientId]);
  expect(audit.rows).toEqual([{ entraObjectId: E2E_MEMBER_A.entraObjectId, isSuperAdmin: false }]);
  await panel.getByLabel("Company Sheet tab name").fill("Changed but unsaved");
  await expect(panel.getByRole("button", { name: "Sync company names now" })).toBeDisabled();
  await panel.getByRole("link", { name: "Refresh sheet status" }).click();
  await expect(panel.getByLabel("Company Sheet tab name")).toHaveValue("Sheet1");
  expect((await pool.query('SELECT id FROM "CompanyDncEntry" WHERE "clientId"=$1', [clientId])).rowCount).toBe(0);
  expect((await pool.query('SELECT id FROM "OutboundEmail" WHERE "clientId"=$1', [clientId])).rowCount).toBe(0);
});
test("a lost save response requires refresh and does not cause duplicate writes", async ({ page }) => {
  await page.goto(url);
  const panel = page.getByRole("region", { name: "Company-name Google Sheet", exact: true });
  let dropped = false;
  await page.route(`**${url}`, async route => {
    if (!dropped && route.request().method() === "POST" && route.request().headers()["next-action"]) {
      dropped = true; const response = await route.fetch(); expect(response.ok()).toBe(true); await response.dispose(); await route.abort("failed");
    } else await route.continue();
  });
  await panel.getByLabel("Company Sheet URL", { exact: true }).fill(sheetId);
  await panel.getByRole("button", { name: "Save company sheet" }).click();
  await expect(panel.getByRole("status")).toContainText("response was interrupted");
  await expect(panel.getByRole("button", { name: "Save company sheet" })).toBeDisabled();
  await panel.getByRole("link", { name: "Refresh sheet status" }).click();
  await expect(panel.getByRole("button", { name: "Sync company names now" })).toBeEnabled();
  expect((await pool.query('SELECT revision FROM "CompanyDncSheetSource" WHERE "clientId"=$1', [clientId])).rows).toEqual([{ revision: 0 }]);
});
test("failed Google configuration keeps the last successful count and retained-block warning", async ({ page }) => {
  await pool.query(`INSERT INTO "CompanyDncSheetSource" (id,"clientId","spreadsheetId","tabName","knownNames","currentNames","retainedCount","lastSuccessAt","updatedAt") VALUES ($1,$1,$2,'Sheet1',ARRAY['acme','old'],ARRAY['acme'],1,NOW(),NOW())`, [clientId, sheetId]);
  await page.goto(url);
  const panel = page.getByRole("region", { name: "Company-name Google Sheet", exact: true });
  await expect(panel.getByText("1 names absent from the sheet remain blocked.", { exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Sync company names now" }).click();
  await expect(panel.getByRole("status")).toContainText("could not be read");
  await expect(panel.getByText(/Last attempt failed/)).toBeVisible();
  expect((await pool.query('SELECT "currentNames","retainedCount" FROM "CompanyDncSheetSource" WHERE "clientId"=$1', [clientId])).rows).toEqual([{ currentNames: ["acme"], retainedCount: 1 }]);
});
