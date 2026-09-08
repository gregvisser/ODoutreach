import { test, expect } from "@playwright/test";
import { Pool } from "pg";
import { E2E_DATABASE_URL } from "./env";
import { E2E_MEMBER_A, E2E_STORAGE_STATE } from "./fixtures";
import { assertSafeTestDatabase } from "./safe-database";

test.use({ storageState: E2E_STORAGE_STATE.memberA });
const clientId = "e2e-calendar-allowance-only";
let pool: Pool;
test.beforeAll(async () => {
  pool = new Pool({ connectionString: assertSafeTestDatabase(E2E_DATABASE_URL).toString() });
  await pool.query('INSERT INTO "Client" (id,name,slug,"inboundIngestToken",status,"updatedAt") VALUES ($1,$2,$1,$1,\'ACTIVE\',NOW())', [clientId, "Synthetic local calendar"]);
  await pool.query(`INSERT INTO "ClientMembership" (id,"clientId","staffUserId",role) SELECT $1,$1,id,'CONTRIBUTOR' FROM "StaffUser" WHERE "entraObjectId"=$2`, [clientId, E2E_MEMBER_A.entraObjectId]);
  await pool.query(`INSERT INTO "ClientMailboxIdentity" (id,"clientId",provider,email,"emailNormalized","connectionStatus","isSendingEnabled","updatedAt") VALUES ($1,$1,'GOOGLE','calendar@example.test','calendar@example.test','CONNECTED',true,NOW())`, [clientId]);
  await pool.query(`INSERT INTO "ClientSendingCalendar" (id,"clientId","timeZone",weekdays,"startMinute","endMinute","previousDayEndsAt","effectiveAt","createdByStaffUserId") SELECT $1,$1,'Asia/Kathmandu',ARRAY[1,2,3,4,5],540,1020,'2020-01-01T00:00Z','2020-01-01T18:15Z',id FROM "StaffUser" WHERE "entraObjectId"=$2`, [clientId, E2E_MEMBER_A.entraObjectId]);
  const day = await pool.query(`SELECT date_trunc('day',now() AT TIME ZONE 'Asia/Kathmandu') AT TIME ZONE 'Asia/Kathmandu' AS start`);
  const key = new Date(day.rows[0].start).toISOString();
  for (let n = 0; n < 29; n++) await pool.query(`INSERT INTO "MailboxSendReservation" (id,"clientId","mailboxIdentityId","idempotencyKey","windowKey",status,"updatedAt") VALUES ($1,$2,$2,$1,$3,'CONSUMED',NOW())`, [`${clientId}-${n}`, clientId, key]);
});
test.afterAll(async () => {
  await pool?.query('DELETE FROM "Client" WHERE id=$1', [clientId]);
  await pool?.end();
});

test("ordinary staff see the local allowance and reset consistently across mailbox and activity screens", async ({ page }) => {
  await page.goto(`/clients/${clientId}/mailboxes`);
  // ICU releases use either IANA spelling for the same named timezone.
  await expect(page.getByRole("main").getByText(/Daily allowance timezone: Asia\/Kath?mandu/)).toBeVisible();
  const row = page.getByRole("row").filter({ hasText: "calendar@example.test" }).first();
  await expect(row).toContainText(/29\s*\/\s*30/);
  await expect(page.getByRole("main").getByText(/allowance resets/)).toBeVisible();
  await page.locator(`a[href="/clients/${clientId}/activity"]`).first().click();
  await expect(page).toHaveURL(new RegExp(`/clients/${clientId}/activity$`));
  await page.getByText("Daily allowance", { exact: true }).click();
  await expect(page.getByRole("main").getByText(/Daily allowance timezone: Asia\/Kath?mandu/)).toBeVisible();
  expect((await pool.query('SELECT id FROM "OutboundEmail" WHERE "clientId"=$1', [clientId])).rowCount).toBe(0);
});
