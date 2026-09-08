import { test, expect } from "@playwright/test";
import { Pool } from "pg";
import { E2E_DATABASE_URL } from "./env";
import { E2E_MEMBER_A, E2E_STORAGE_STATE } from "./fixtures";
import { assertSafeTestDatabase } from "./safe-database";

test.describe.configure({ mode: "serial", retries: 0 });
test.use({ storageState: E2E_STORAGE_STATE.memberA, viewport: { width: 390, height: 844 }, trace: "retain-on-failure" });
const clientId = "e2e-held-review-only";
const url = `/clients/${clientId}/email-review`;
let pool: Pool;
test.beforeAll(async () => {
  pool = new Pool({ connectionString: assertSafeTestDatabase(E2E_DATABASE_URL).toString() });
  await pool.query('INSERT INTO "Client" (id,name,slug,"inboundIngestToken",status,"autonomousSendEnabled","updatedAt") VALUES ($1,$2,$1,$1,\'ACTIVE\',false,NOW())', [clientId, "Synthetic email review"]);
  await pool.query(`INSERT INTO "ClientMailboxIdentity" (id,"clientId",provider,email,"emailNormalized","connectionStatus","isSendingEnabled","canSend","dailySendCap","updatedAt") VALUES ($1,$1,'GOOGLE','review@example.test','review@example.test','CONNECTED',true,true,2,NOW())`, [clientId]);
});
test.beforeEach(async () => {
  await pool.query('DELETE FROM "MailboxSendReservation" WHERE "clientId"=$1', [clientId]);
  await pool.query('DELETE FROM "OutboundEmail" WHERE "clientId"=$1', [clientId]);
  await pool.query('DELETE FROM "AuditLog" WHERE "clientId"=$1', [clientId]);
  await pool.query(`INSERT INTO "OutboundEmail" (id,"correlationId","clientId","mailboxIdentityId","toEmail","fromAddress",subject,"bodySnapshot",status,"lastErrorCode",metadata,"updatedAt") VALUES ($1,$1,$1,$1,'recipient@example.test','review@example.test','Synthetic review subject','Saved message for human review','FAILED','AUTOMATED_SEND_DISABLED','{"sendOrigin":"AUTOMATED_SEQUENCE"}',NOW())`, [clientId]);
});
test.afterAll(async () => { await pool?.query('DELETE FROM "Client" WHERE id=$1', [clientId]); await pool?.end(); });
test("ordinary staff review a saved email on mobile and queue it once without enabling automation", async ({ page }, testInfo) => {
  await page.goto(`/clients/${clientId}/mailboxes`);
  await page.getByRole("link", { name: "Email approvals", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${url}$`));
  const panel = page.getByRole("article", { name: "Review email to recipient@example.test" });
  await expect(panel.getByText("Saved message for human review", { exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Approve and queue this email" })).toBeDisabled();
  await panel.getByRole("checkbox").check();
  await panel.getByRole("button", { name: "Approve and queue this email" }).click();
  await expect(panel.getByRole("status")).toContainText("This email is queued with your approval.");
  await expect(panel.getByRole("button")).toBeDisabled();
  await panel.screenshot({ path: testInfo.outputPath("staff-review-mobile.png") });
  const saved = await pool.query('SELECT o.status,s."entraObjectId",c."autonomousSendEnabled" FROM "OutboundEmail" o JOIN "StaffUser" s ON s.id=o."staffUserId" JOIN "Client" c ON c.id=o."clientId" WHERE o.id=$1', [clientId]);
  expect(saved.rows).toEqual([{ status: "QUEUED", entraObjectId: E2E_MEMBER_A.entraObjectId, autonomousSendEnabled: false }]);
  await page.getByRole("link", { name: "Refresh review status" }).click();
  await expect(page.getByRole("main").getByText("No emails waiting on this page.", { exact: true })).toBeVisible();
});
test.describe("controlled lost acknowledgement", () => {
  test.use({ serviceWorkers: "block" });
test("a lost approval response prevents a blind repeat and refresh shows the saved result", async ({ page }) => {
  await page.goto(url);
  let dropped = false;
  await page.route(`**${url}`, async route => {
    if (!dropped && route.request().method() === "POST" && route.request().headers()["next-action"]) {
      dropped = true;
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      await response.dispose(); await route.abort("failed");
    } else await route.continue();
  });
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Approve and queue this email" }).click();
  await expect.poll(() => dropped).toBe(true);
  await expect(page.getByRole("status")).toContainText("We could not confirm the result.");
  await expect(page.getByRole("button", { name: "Refresh to check status" })).toBeDisabled();
  expect(dropped).toBe(true);
  expect((await pool.query('SELECT id FROM "AuditLog" WHERE "clientId"=$1', [clientId])).rowCount).toBe(1);
  await page.getByRole("link", { name: "Refresh review status" }).click();
  await expect(page.getByRole("main").getByText("No emails waiting on this page.", { exact: true })).toBeVisible();
});
});

test.describe("signed-out visitor", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test("cannot open held emails", async ({ page }) => {
    await page.goto(url);
    await expect(page).toHaveURL(/\/sign-in/);
    await expect(page.getByText("Saved message for human review", { exact: true })).toHaveCount(0);
  });
});
