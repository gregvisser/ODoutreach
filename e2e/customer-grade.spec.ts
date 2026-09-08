import { test, expect } from "@playwright/test";
import { Pool } from "pg";
import { E2E_DATABASE_URL } from "./env";
import { E2E_MEMBER_A, E2E_STORAGE_STATE } from "./fixtures";
import { assertSafeTestDatabase } from "./safe-database";

test.describe.configure({ mode: "serial", retries: 0 });
test.use({ storageState: E2E_STORAGE_STATE.memberA, viewport: { width: 390, height: 844 }, trace: "retain-on-failure" });
const clientId = "e2e-service-grade-only";
const url = `/clients/${clientId}`;
let pool: Pool;
test.beforeAll(async () => {
  pool = new Pool({ connectionString: assertSafeTestDatabase(E2E_DATABASE_URL).toString() });
  await pool.query('INSERT INTO "Client" (id,name,slug,"inboundIngestToken",status,"accountGrade","autonomousSendEnabled","updatedAt") VALUES ($1,$2,$1,$1,\'ACTIVE\',\'CORPORATE\',false,NOW())', [clientId, "Synthetic customer grade"]);
});
test.beforeEach(async () => {
  await pool.query('UPDATE "Client" SET "serviceTier"=NULL,"serviceTierSetAt"=NULL,"serviceTierSetByStaffUserId"=NULL,"serviceTierRevision"=0 WHERE id=$1', [clientId]);
  await pool.query('DELETE FROM "AuditLog" WHERE "clientId"=$1', [clientId]);
});
test.afterAll(async () => { await pool?.query('DELETE FROM "Client" WHERE id=$1', [clientId]); await pool?.end(); });
test("ordinary staff reach the grade on mobile and persist all three agreed choices", async ({ page }, testInfo) => {
  await page.goto(`${url}/mailboxes`);
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  const panel = page.getByRole("region", { name: "Customer grade", exact: true });
  for (const [value, label] of [["MAINTENANCE", "Maintenance"], ["GROWTH", "Growth"], ["STRATEGIC", "Strategic"]]) {
    await panel.getByLabel("Choose customer grade", { exact: true }).selectOption(value);
    await panel.getByRole("button", { name: "Save customer grade" }).click();
    await expect(panel.getByRole("status")).toHaveText("Customer grade saved. Sending settings are unchanged.");
    await expect(panel.getByRole("button", { name: "Save customer grade" })).toBeDisabled();
    await panel.getByRole("link", { name: "Refresh customer grade" }).click();
    await expect(panel).toContainText(`Current grade: ${label}`);
    await expect(panel).toContainText("Set by");
  }
  await panel.screenshot({ path: testInfo.outputPath("customer-grade-mobile.png") });
  const saved = await pool.query('SELECT c."serviceTier",c."serviceTierRevision",c."accountGrade",c."autonomousSendEnabled",s."entraObjectId" FROM "Client" c JOIN "StaffUser" s ON s.id=c."serviceTierSetByStaffUserId" WHERE c.id=$1', [clientId]);
  expect(saved.rows).toEqual([{ serviceTier: "STRATEGIC", serviceTierRevision: 3, accountGrade: "CORPORATE", autonomousSendEnabled: false, entraObjectId: E2E_MEMBER_A.entraObjectId }]);
  expect((await pool.query('SELECT id FROM "AuditLog" WHERE "clientId"=$1', [clientId])).rowCount).toBe(3);
  expect((await pool.query('SELECT id FROM "OutboundEmail" WHERE "clientId"=$1', [clientId])).rowCount).toBe(0);
});
test.describe("controlled lost acknowledgement", () => {
  test.use({ serviceWorkers: "block" });
  test("a lost save response locks the form and refresh recovers the single grade change", async ({ page }) => {
    await page.goto(url);
    const panel = page.getByRole("region", { name: "Customer grade", exact: true });
    let dropped = false;
    await page.route(`**${url}`, async route => {
      if (!dropped && route.request().method() === "POST" && route.request().headers()["next-action"]) {
        dropped = true;
        const response = await route.fetch(); expect(response.ok()).toBe(true);
        await response.dispose(); await route.abort("failed");
      } else await route.continue();
    });
    await panel.getByLabel("Choose customer grade", { exact: true }).selectOption("GROWTH");
    await panel.getByRole("button", { name: "Save customer grade" }).click();
    await expect.poll(() => dropped).toBe(true);
    await expect(panel.getByRole("status")).toContainText("We could not confirm the grade change.");
    await expect(panel.getByRole("button", { name: "Save customer grade" })).toBeDisabled();
    await panel.getByRole("link", { name: "Refresh customer grade" }).click();
    await expect(panel).toContainText("Current grade: Growth");
    expect((await pool.query('SELECT id FROM "AuditLog" WHERE "clientId"=$1', [clientId])).rowCount).toBe(1);
  });
});
test.describe("signed-out visitor", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test("cannot open the customer grade", async ({ page }) => {
    await page.goto(url);
    await expect(page).toHaveURL(/\/sign-in/);
    await expect(page.getByRole("region", { name: "Customer grade", exact: true })).toHaveCount(0);
  });
});
