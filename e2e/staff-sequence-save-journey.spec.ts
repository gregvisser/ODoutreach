import { test, expect } from "@playwright/test";
import { Pool } from "pg";
import { E2E_DATABASE_URL } from "./env";
import { E2E_MEMBER_A, E2E_STORAGE_STATE } from "./fixtures";
import { assertSafeTestDatabase } from "./safe-database";

test.use({ storageState: E2E_STORAGE_STATE.memberA, trace: "on" });
const clientId = "e2e-staff-sequence-save";
let pool: Pool;
test.beforeAll(async () => {
  pool = new Pool({ connectionString: assertSafeTestDatabase(E2E_DATABASE_URL).toString() });
  await pool.query(`INSERT INTO "Client" (id,name,slug,"inboundIngestToken",status,"updatedAt") VALUES ($1,'Synthetic sequence workspace',$1,$1,'ACTIVE',NOW())`, [clientId]);
  await pool.query(`INSERT INTO "ClientMembership" (id,"clientId","staffUserId",role) SELECT $1,$1,id,'CONTRIBUTOR' FROM "StaffUser" WHERE "entraObjectId"=$2`, [clientId,E2E_MEMBER_A.entraObjectId]);
  await pool.query(`INSERT INTO "ContactList" (id,name,"clientId","updatedAt") VALUES ($1,'Empty synthetic list',$1,NOW())`, [clientId]);
  await pool.query(`INSERT INTO "ClientEmailTemplate" (id,"clientId",name,category,subject,content,"updatedAt") VALUES ($1,$2,'Synthetic intro','INTRODUCTION','Do not send','Synthetic body',NOW())`, [clientId + "-intro",clientId]);
});
test.afterAll(async () => {
  await pool?.query('DELETE FROM "ClientEmailSequence" WHERE "clientId"=$1', [clientId]);
  await pool?.query('DELETE FROM "ContactList" WHERE "clientId"=$1', [clientId]);
  await pool?.query('DELETE FROM "Client" WHERE id=$1', [clientId]);
  await pool?.end();
});

test("ordinary staff save and edit a delayed introduction without queueing email", async ({ page }) => {
  await page.goto(`/clients/${clientId}/outreach`);
  await page.locator("summary").filter({ hasText: "New sequence" }).click();
  await page.getByRole("textbox", { name: "Sequence name", exact: true }).fill("Synthetic sequence version one");
  await page.getByRole("combobox", { name: "Target email list", exact: true }).selectOption(clientId);
  await page.locator('select[name="template_INTRODUCTION"]').selectOption(clientId + "-intro");
  await page.locator('input[name="delayHours_INTRODUCTION"]').fill("2");
  await page.getByRole("button", { name: "Save sequence", exact: true }).click();
  await expect(page).toHaveURL((url) => url.searchParams.has("sequenceId") && (url.searchParams.get("sequence") ?? "").startsWith("Saved"));
  await expect(page.getByRole("row").filter({ hasText: "Synthetic sequence version one" })).toBeVisible();
  const saved = await pool.query('SELECT id,status FROM "ClientEmailSequence" WHERE "clientId"=$1', [clientId]);
  expect(saved.rows).toHaveLength(1);
  expect(saved.rows[0].status).toBe("DRAFT");
  const sequenceId = saved.rows[0].id;
  expect((await pool.query('SELECT "delayHours" FROM "ClientEmailSequenceStep" WHERE "sequenceId"=$1', [sequenceId])).rows).toEqual([{ delayHours: 2 }]);
  await page.reload();
  await page.getByRole("row").filter({ hasText: "Synthetic sequence version one" }).getByRole("link", { name: "Edit", exact: true }).click();
  await expect(page).toHaveURL((url) => url.searchParams.get("sequenceId") === sequenceId && url.searchParams.get("edit") === "1");
  await expect(page.locator("details").filter({ has: page.locator("summary", { hasText: /^Edit sequence$/ }) })).toHaveAttribute("open", "");
  await expect(page.getByRole("textbox", { name: "Sequence name", exact: true })).toHaveValue("Synthetic sequence version one");
  await page.getByRole("textbox", { name: "Sequence name", exact: true }).fill("Synthetic sequence version two");
  await page.locator('input[name="delayHours_INTRODUCTION"]:visible').fill("3");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page).toHaveURL((url) => url.searchParams.get("sequenceId") === sequenceId && (url.searchParams.get("sequence") ?? "").startsWith("Updated"));
  await expect(page.getByRole("row").filter({ hasText: "Synthetic sequence version two" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("row").filter({ hasText: "Synthetic sequence version two" })).toBeVisible();
  expect((await pool.query('SELECT "delayHours" FROM "ClientEmailSequenceStep" WHERE "sequenceId"=$1', [sequenceId])).rows).toEqual([{ delayHours: 3 }]);
  expect((await pool.query('SELECT id FROM "OutboundEmail" WHERE "clientId"=$1', [clientId])).rowCount).toBe(0);
});
