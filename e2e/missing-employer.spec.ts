import { test, expect } from "@playwright/test";
import { Pool } from "pg";
import { E2E_DATABASE_URL } from "./env";
import { E2E_STORAGE_STATE } from "./fixtures";
import { assertSafeTestDatabase } from "./safe-database";

test.describe.configure({ mode: "serial", retries: 0 });
test.use({ storageState: E2E_STORAGE_STATE.memberA, viewport: { width: 390, height: 844 }, trace: "retain-on-failure" });
const clientId = "e2e-missing-employer-only";
const url = `/clients/${clientId}/suppression`;
let pool: Pool;
test.beforeAll(async () => {
  pool = new Pool({ connectionString: assertSafeTestDatabase(E2E_DATABASE_URL).toString() });
  await pool.query('INSERT INTO "Client" (id,name,slug,"inboundIngestToken",status,"updatedAt") VALUES ($1,$2,$1,$1,\'ACTIVE\',NOW())', [clientId, "Synthetic employer review"]);
  await pool.query('INSERT INTO "CompanyDncEntry" (id,"clientId","originalName","canonicalName") VALUES ($1,$1,\'Acme\',\'acme\')', [clientId]);
});
test.beforeEach(async () => {
  await pool.query('DELETE FROM "Contact" WHERE "clientId"=$1', [clientId]);
  await pool.query('DELETE FROM "AuditLog" WHERE "clientId"=$1', [clientId]);
  for (const name of ["Blocked fixture", "Clear fixture"]) await pool.query('INSERT INTO "Contact" (id,"clientId",email,"fullName","isSuppressed","updatedAt") VALUES ($1,$2,$3,$4,true,NOW())', [`${clientId}-${name}`, clientId, `${name.startsWith("Blocked") ? "blocked" : "clear"}@example.test`, name]);
});
test.afterAll(async () => { await pool?.query('DELETE FROM "Client" WHERE id=$1', [clientId]); await pool?.end(); });
test("staff add missing employers in place, retain exact blocks and refresh the result", async ({ page }, testInfo) => {
  await page.goto(`/clients/${clientId}/mailboxes`);
  await page.getByRole("link", { name: "Do-not-contact", exact: true }).click();
  const panel = page.getByRole("main").getByRole("region", { name: "Company-name do-not-contact", exact: true });
  const blocked = panel.getByRole("group", { name: "Contact review: Blocked fixture", exact: true });
  await blocked.screenshot({ path: testInfo.outputPath("missing-employer-form-mobile.png") });
  await blocked.getByLabel("Employer company name").fill("Acme Limited");
  await blocked.getByRole("button", { name: "Save employer and check" }).click();
  await expect(panel.getByRole("status")).toContainText("Employer saved and do-not-contact checks refreshed.");
  await expect(blocked.getByText("Blocked", { exact: true })).toBeVisible();
  const clear = panel.getByRole("group", { name: "Contact review: Clear fixture", exact: true });
  await clear.getByLabel("Employer company name").fill("Birch Engineering");
  await clear.getByRole("button", { name: "Save employer and check" }).click();
  await expect(clear).toHaveCount(0);
  await panel.getByRole("button", { name: "Refresh contact checks" }).click();
  await expect(panel.getByRole("status")).toContainText("Contact checks refreshed.");
  await page.reload();
  await expect(blocked.getByText("Blocked", { exact: true })).toBeVisible();
  expect((await pool.query('SELECT company,"isSuppressed" FROM "Contact" WHERE "clientId"=$1 ORDER BY email', [clientId])).rows).toEqual([{ company: "Acme Limited", isSuppressed: true }, { company: "Birch Engineering", isSuppressed: false }]);
  expect((await pool.query('SELECT id FROM "AuditLog" WHERE "clientId"=$1', [clientId])).rowCount).toBe(2);
  expect((await pool.query('SELECT id FROM "OutboundEmail" WHERE "clientId"=$1', [clientId])).rowCount).toBe(0);
  await panel.screenshot({ path: testInfo.outputPath("missing-employer-mobile.png") });
});
test.describe("lost acknowledgement", () => {
  test.use({ serviceWorkers: "block" });
  test("a lost employer-save response blocks blind repeats and refresh recovers the saved name", async ({ page }) => {
    await page.goto(url);
    const panel = page.getByRole("main").getByRole("region", { name: "Company-name do-not-contact", exact: true });
    const blocked = panel.getByRole("group", { name: "Contact review: Blocked fixture", exact: true });
    let dropped = false;
    await page.route(`**${url}`, async route => {
      if (!dropped && route.request().method() === "POST" && route.request().headers()["next-action"]) {
        dropped = true; const response = await route.fetch(); expect(response.ok()).toBe(true);
        await response.dispose(); await route.abort("failed");
      } else await route.continue();
    });
    await blocked.getByLabel("Employer company name").fill("Acme Limited");
    await blocked.getByRole("button", { name: "Save employer and check" }).click();
    await expect.poll(() => dropped).toBe(true);
    await expect(blocked.getByRole("status")).toContainText("We could not confirm the employer save.");
    await expect(blocked.getByRole("button", { name: "Save employer and check" })).toBeDisabled();
    await blocked.getByRole("link", { name: "Refresh company review" }).click();
    await expect(blocked.getByText("Blocked", { exact: true })).toBeVisible();
    expect((await pool.query('SELECT id FROM "AuditLog" WHERE "clientId"=$1', [clientId])).rowCount).toBe(1);
    expect((await pool.query('SELECT id FROM "OutboundEmail" WHERE "clientId"=$1', [clientId])).rowCount).toBe(0);
  });
});
