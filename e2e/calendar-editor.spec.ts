import { test, expect } from "@playwright/test";
import { Pool } from "pg";
import { E2E_DATABASE_URL } from "./env";
import { E2E_MEMBER_A, E2E_STORAGE_STATE } from "./fixtures";
import { assertSafeTestDatabase } from "./safe-database";

test.describe.configure({ mode: "serial", retries: 0 });
test.use({ storageState: E2E_STORAGE_STATE.memberA, viewport: { width: 390, height: 844 }, trace: "retain-on-failure" });
const clientId = "e2e-calendar-editor-only";
const url = `/clients/${clientId}/mailboxes`;
let pool: Pool;
test.beforeAll(async () => {
  pool = new Pool({ connectionString: assertSafeTestDatabase(E2E_DATABASE_URL).toString() });
  await pool.query('INSERT INTO "Client" (id,name,slug,"inboundIngestToken",status,"updatedAt") VALUES ($1,$2,$1,$1,\'ACTIVE\',NOW())', [clientId, "Synthetic calendar editor"]);
  await pool.query(`INSERT INTO "ClientMembership" (id,"clientId","staffUserId",role) SELECT $1,$1,id,'CONTRIBUTOR' FROM "StaffUser" WHERE "entraObjectId"=$2`, [clientId, E2E_MEMBER_A.entraObjectId]);
  await pool.query(`INSERT INTO "ClientMailboxIdentity" (id,"clientId",provider,email,"emailNormalized","connectionStatus","isSendingEnabled","updatedAt") VALUES ($1,$1,'GOOGLE','editor@example.test','editor@example.test','CONNECTED',true,NOW())`, [clientId]);
});
test.beforeEach(async () => {
  await pool.query('DELETE FROM "ClientSendingCalendar" WHERE "clientId"=$1', [clientId]);
  await pool.query('DELETE FROM "AuditLog" WHERE "clientId"=$1', [clientId]);
});
test.afterAll(async () => { await pool?.query('DELETE FROM "Client" WHERE id=$1', [clientId]); await pool?.end(); });

test("ordinary staff validate, schedule and reload a calendar without enabling sends", async ({ page }, testInfo) => {
  await page.goto(url);
  const panel = page.getByRole("region", { name: "Sending calendar", exact: true });
  await panel.getByLabel("Timezone", { exact: true }).selectOption("Europe/London");
  for (const day of ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]) await panel.getByLabel(day, { exact: true }).uncheck();
  await panel.getByRole("button", { name: "Schedule calendar change" }).click();
  await expect(panel.getByRole("status")).toHaveText("Choose at least one sending day.");
  expect((await pool.query('SELECT id FROM "ClientSendingCalendar" WHERE "clientId"=$1', [clientId])).rowCount).toBe(0);
  await panel.getByLabel("Monday", { exact: true }).check();
  await panel.getByLabel("Start time", { exact: true }).fill("09:30");
  await panel.getByLabel("End time", { exact: true }).fill("16:30");
  await panel.getByRole("button", { name: "Schedule calendar change" }).click();
  await expect(panel.getByRole("status")).toContainText("Calendar change scheduled.");
  await expect(panel.getByText(/Takes effect:/)).toBeVisible();
  await expect(panel.getByRole("button", { name: "Schedule calendar change" })).toHaveCount(0);
  const saved = await pool.query('SELECT "timeZone",weekdays,"startMinute","endMinute" FROM "ClientSendingCalendar" WHERE "clientId"=$1', [clientId]);
  expect(saved.rows).toEqual([{ timeZone: "Europe/London", weekdays: [1], startMinute: 570, endMinute: 990 }]);
  const audit = await pool.query('SELECT s."entraObjectId" FROM "AuditLog" a JOIN "StaffUser" s ON s.id=a."staffUserId" WHERE a."clientId"=$1 AND a."entityType"=\'ClientSendingCalendar\'', [clientId]);
  expect(audit.rows).toEqual([{ entraObjectId: E2E_MEMBER_A.entraObjectId }]);
  await panel.getByRole("link", { name: "Refresh calendar status" }).click();
  await expect(panel.getByText(/Scheduled calendar:.*Monday.*09:30–16:30/)).toBeVisible();
  await panel.screenshot({ path: testInfo.outputPath("calendar-saved-mobile.png") });
  expect((await pool.query('SELECT id FROM "OutboundEmail" WHERE "clientId"=$1', [clientId])).rowCount).toBe(0);
});

test.describe("controlled lost acknowledgement", () => {
  // Playwright request routing cannot reliably intercept service-worker requests.
  // Only the injected-failure scenario disables it; ordinary journeys keep it.
  test.use({ serviceWorkers: "block" });
test("a lost save response blocks a blind repeat and refresh recovers the one saved change", async ({ page }) => {
  await page.goto(url);
  const panel = page.getByRole("region", { name: "Sending calendar", exact: true });
  await panel.getByLabel("Timezone", { exact: true }).selectOption("Europe/London");
  let dropped = false;
  await page.route(`**${url}`, async route => {
    if (!dropped && route.request().method() === "POST" && route.request().headers()["next-action"]) {
      dropped = true;
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      await response.dispose();
      await route.abort("failed");
    } else await route.continue();
  });
  await panel.getByRole("button", { name: "Schedule calendar change" }).click();
  await expect.poll(() => dropped, { message: "The fault injection must intercept the save POST" }).toBe(true);
  await expect(panel.getByRole("status")).toContainText("We could not confirm the calendar change.");
  await expect(panel.getByRole("button", { name: "Schedule calendar change" })).toBeDisabled();
  expect(dropped).toBe(true);
  await panel.getByRole("link", { name: "Refresh calendar status" }).click();
  await expect(panel.getByText(/Takes effect:/)).toBeVisible();
  expect((await pool.query('SELECT id FROM "ClientSendingCalendar" WHERE "clientId"=$1', [clientId])).rowCount).toBe(1);
});

});

test.describe("signed-out visitor", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test("cannot open the calendar editor", async ({ page }) => {
    await page.goto(url);
    await expect(page).toHaveURL(/\/sign-in/);
    await expect(page.getByRole("region", { name: "Sending calendar", exact: true })).toHaveCount(0);
    expect((await pool.query('SELECT id FROM "ClientSendingCalendar" WHERE "clientId"=$1', [clientId])).rowCount).toBe(0);
  });
});
