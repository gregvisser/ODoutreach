import { test, expect, type Page } from "@playwright/test";
import { Pool } from "pg";
import { E2E_DATABASE_URL } from "./env";
import { E2E_REPLY_RECOVERY as fixture, E2E_STAFF, E2E_STORAGE_STATE } from "./fixtures";
import { assertSafeTestDatabase } from "./safe-database";
import { replyAttemptStorageKey } from "../src/lib/inbox/reply-attempt";

test.use({ storageState: E2E_STORAGE_STATE.staff });
const messageUrl = `/clients/${fixture.clientId}/activity/messages/${fixture.messageId}`;
let pool: Pool;
let storageKey: string;
test.beforeAll(async () => {
  pool = new Pool({ connectionString: assertSafeTestDatabase(E2E_DATABASE_URL).toString() });
  const staff = await pool.query('SELECT id FROM "StaffUser" WHERE "entraObjectId"=$1', [E2E_STAFF.entraObjectId]);
  expect(staff.rows).toHaveLength(1);
  storageKey = replyAttemptStorageKey(staff.rows[0].id, fixture.clientId, fixture.messageId);
});
test.afterAll(async () => { await pool?.end(); });

async function restoreAttempt(page: Page) {
  await page.goto(messageUrl);
  await expect(page.getByRole("textbox", { name: "Reply body" })).toBeVisible();
  await page.evaluate(({ key, attempt }) => sessionStorage.setItem(key, JSON.stringify(attempt)), {
    key: storageKey, attempt: { requestId: fixture.requestId, bodyText: fixture.bodyText },
  });
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Reply body" })).toHaveValue(fixture.bodyText);
  await expect(page.getByRole("textbox", { name: "Reply body" })).toBeDisabled();
}

async function expectOneSavedSend() {
  const sends = await pool.query('SELECT id FROM "OutboundEmail" WHERE "clientId"=$1', [fixture.clientId]);
  const slots = await pool.query('SELECT id FROM "MailboxSendReservation" WHERE "clientId"=$1', [fixture.clientId]);
  expect(sends.rows).toEqual([{ id: fixture.outboundId }]);
  expect(slots.rows).toEqual([{ id: fixture.reservationId }]);
}

test("recovers a saved confirmation after refresh without creating a second send", async ({ page }) => {
  await restoreAttempt(page);
  await page.getByRole("button", { name: "Retry this reply", exact: true }).click();
  await expect(page.getByText("This reply was already sent. Its saved confirmation has been recovered.", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Reply body" })).toHaveValue("");
  expect(await page.evaluate((key) => sessionStorage.getItem(key), storageKey)).toBeNull();
  await expectOneSavedSend();
});

test("retains the exact attempt when a completed server-action response is lost", async ({ page }) => {
  await restoreAttempt(page);
  let dropped = false;
  await page.route(`**${messageUrl}`, async (route) => {
    if (!dropped && route.request().method() === "POST" && route.request().headers()["next-action"]) {
      dropped = true;
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      await response.dispose();
      await route.abort("failed");
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Retry this reply", exact: true }).click();
  await expect(page.getByText(/The reply confirmation was not received/)).toBeVisible();
  expect(dropped).toBe(true);
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Reply body" })).toHaveValue(fixture.bodyText);
  await page.getByRole("button", { name: "Retry this reply", exact: true }).click();
  await expect(page.getByText("This reply was already sent. Its saved confirmation has been recovered.", { exact: true })).toBeVisible();
  await expectOneSavedSend();
});

test("refuses to dispatch if the browser cannot preserve the attempt", async ({ page }) => {
  await page.goto(messageUrl);
  const body = page.getByRole("textbox", { name: "Reply body" });
  await body.fill("Synthetic draft that must never leave this browser.");
  let actionPosts = 0;
  page.on("request", (request) => { if (request.method() === "POST" && request.headers()["next-action"]) actionPosts++; });
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error("Synthetic storage failure"); }; });
  await page.getByRole("button", { name: "Send reply", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Your browser could not preserve this reply attempt" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send reply", exact: true })).toBeDisabled();
  expect(actionPosts).toBe(0);
  await expectOneSavedSend();
});
