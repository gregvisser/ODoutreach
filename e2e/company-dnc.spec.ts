import { test, expect } from "@playwright/test";
import { Pool } from "pg";
import { E2E_DATABASE_URL } from "./env";
import { E2E_MEMBER_A, E2E_STORAGE_STATE } from "./fixtures";
import { assertSafeTestDatabase } from "./safe-database";

test.use({ storageState: E2E_STORAGE_STATE.memberA, viewport: { width: 390, height: 844 } });
let pool: Pool;
const clientId = "e2e-company-dnc-only";
test.beforeAll(async () => {
  pool = new Pool({ connectionString: assertSafeTestDatabase(E2E_DATABASE_URL).toString() });
  await pool.query('INSERT INTO "Client" (id,name,slug,"inboundIngestToken",status,"updatedAt") VALUES ($1,$2,$1,$1,\'ACTIVE\',NOW())', [clientId,"Synthetic company review"]);
  await pool.query(`INSERT INTO "ClientMembership" (id,"clientId","staffUserId",role) SELECT $1,$1,id,'CONTRIBUTOR' FROM "StaffUser" WHERE "entraObjectId"=$2`, [clientId,E2E_MEMBER_A.entraObjectId]);
  await pool.query(`INSERT INTO "Contact" (id,"clientId",email,company,"fullName","updatedAt") VALUES ($1,$2,'name-review@example.test','Acme Group','Synthetic prospect',NOW())`, [clientId,clientId]);
});
test.afterAll(async () => {
  await pool?.query('DELETE FROM "Contact" WHERE "clientId"=$1', [clientId]);
  await pool?.query('DELETE FROM "Client" WHERE id=$1', [clientId]);
  await pool?.end();
});

test("ordinary staff preview, save, review and reload a company-name list", async ({ page }) => {
  await page.goto(`/clients/${clientId}/suppression`);
  const panel = page.getByRole("main").getByRole("region", { name: "Company-name do-not-contact" });
  await panel.getByLabel("Company names — one per line, no heading").fill("Acme Limited\nBirch & Oak\nACME LTD");
  await panel.getByRole("button", { name: "Preview company list" }).click();
  await expect(panel.getByText("2 distinct names; 1 repeated names. Existing entries will be kept.")).toBeVisible();
  expect((await pool.query('SELECT id FROM "CompanyDncEntry" WHERE "clientId"=$1', [clientId])).rowCount).toBe(0);
  await panel.getByRole("button", { name: "Add company names", exact: true }).click();
  await expect(panel.getByRole("status")).toContainText("Added 2 company names");
  await expect(panel.getByText("Needs review", { exact: true })).toBeVisible();
  expect((await pool.query('SELECT "isSuppressed" FROM "Contact" WHERE id=$1',[clientId])).rows[0].isSuppressed).toBe(true);
  await panel.getByRole("button", { name: "Different company — allow this match" }).click();
  await expect(panel.getByRole("status")).toContainText("Review saved");
  await page.reload();
  await expect(panel.getByText("No company-name holds on this page.")).toBeVisible();
  expect((await pool.query('SELECT "isSuppressed" FROM "Contact" WHERE id=$1',[clientId])).rows[0].isSuppressed).toBe(false);
  expect((await pool.query('SELECT id FROM "CompanyDncDecision" WHERE "clientId"=$1 AND outcome=\'ALLOW\'',[clientId])).rowCount).toBe(1);
  expect((await pool.query('SELECT id FROM "OutboundEmail" WHERE "clientId"=$1',[clientId])).rowCount).toBe(0);
});
