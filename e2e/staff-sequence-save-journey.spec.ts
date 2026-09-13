import { test, expect } from "@playwright/test";
import { Pool } from "pg";
import { E2E_DATABASE_URL } from "./env";
import { E2E_MEMBER_A, E2E_STORAGE_STATE } from "./fixtures";
import { assertSafeTestDatabase } from "./safe-database";

test.use({ storageState: E2E_STORAGE_STATE.memberA, trace: "on" });
test.describe.configure({ mode: "serial" });
const clientId = "e2e-staff-sequence-save";
let pool: Pool;
test.beforeAll(async () => {
  pool = new Pool({ connectionString: assertSafeTestDatabase(E2E_DATABASE_URL).toString() });
  await pool.query(`INSERT INTO "Client" (id,name,slug,"inboundIngestToken",status,"updatedAt") VALUES ($1,'Synthetic sequence workspace',$1,$1,'ACTIVE',NOW())`, [clientId]);
  await pool.query(`INSERT INTO "ClientMembership" (id,"clientId","staffUserId",role) SELECT $1,$1,id,'CONTRIBUTOR' FROM "StaffUser" WHERE "entraObjectId"=$2`, [clientId,E2E_MEMBER_A.entraObjectId]);
  await pool.query(`INSERT INTO "ContactList" (id,name,"clientId","updatedAt") VALUES ($1,'Empty synthetic list',$1,NOW())`, [clientId]);
  await pool.query(`INSERT INTO "ClientEmailTemplate" (id,"clientId",name,category,subject,content,"updatedAt") VALUES ($1,$2,'Synthetic intro','INTRODUCTION','Do not send','Synthetic body',NOW())`, [clientId + "-intro",clientId]);
});

test("lost save acknowledgement prevents a repeated create and recovers the persisted draft", async ({ page }) => {
  let dropped = 0;
  await page.route((url) => url.pathname === `/clients/${clientId}/outreach`, async route => {
    if (route.request().method() !== "POST") return route.continue();
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    await response.dispose();
    dropped += 1;
    await route.abort("failed");
  });
  await page.goto(`/clients/${clientId}/outreach`);
  await page.getByRole("main").locator("summary:visible").filter({ hasText: "New sequence" }).click();
  await page.getByRole("textbox", { name: "Sequence name", exact: true }).fill("Synthetic lost acknowledgement");
  await page.getByRole("combobox", { name: "Target email list", exact: true }).selectOption(clientId);
  await page.locator('select[name="template_INTRODUCTION"]:visible').selectOption(clientId + "-intro");
  const save = page.getByRole("button", { name: "Save sequence", exact: true });
  await save.click();
  await expect(page.getByRole("status")).toContainText("We could not confirm the save result.");
  expect(dropped).toBe(1);
  await expect(save).toBeDisabled();
  const stored = await pool.query('SELECT id FROM "ClientEmailSequence" WHERE "clientId"=$1 AND name=$2', [clientId, "Synthetic lost acknowledgement"]);
  expect(stored.rows).toHaveLength(1);
  await page.getByRole("link", { name: "Refresh sequence list", exact: true }).click();
  await expect(page.getByRole("row").filter({ hasText: "Synthetic lost acknowledgement" })).toBeVisible();
  expect((await pool.query('SELECT id FROM "OutboundEmail" WHERE "clientId"=$1', [clientId])).rowCount).toBe(0);
});
test.afterAll(async () => {
  await pool?.query('DELETE FROM "ClientEmailSequence" WHERE "clientId"=$1', [clientId]);
  await pool?.query('DELETE FROM "ContactList" WHERE "clientId"=$1', [clientId]);
  await pool?.query('DELETE FROM "Client" WHERE id=$1', [clientId]);
  await pool?.end();
});

test("ordinary staff save and edit a delayed introduction without queueing email", async ({ page }) => {
  await page.goto(`/clients/${clientId}/outreach`);
  await page.getByRole("main").locator("summary:visible").filter({ hasText: "New sequence" }).click();
  await page.getByRole("textbox", { name: "Sequence name", exact: true }).fill("Synthetic sequence version one");
  await page.getByRole("combobox", { name: "Target email list", exact: true }).selectOption(clientId);
  await page.locator('select[name="template_INTRODUCTION"]:visible').selectOption(clientId + "-intro");
  await page.locator('input[name="delayHours_INTRODUCTION"]:visible').fill("2");
  await page.getByRole("button", { name: "Save sequence", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Saved — Synthetic sequence version one");
  await page.getByRole("link", { name: "Open saved sequence", exact: true }).click();
  await expect(page).toHaveURL((url) => url.searchParams.has("sequenceId"));
  await expect(page.getByRole("row").filter({ hasText: "Synthetic sequence version one" })).toBeVisible();
  const saved = await pool.query('SELECT id,status FROM "ClientEmailSequence" WHERE "clientId"=$1 AND name=$2', [clientId, "Synthetic sequence version one"]);
  expect(saved.rows).toHaveLength(1);
  expect(saved.rows[0].status).toBe("DRAFT");
  const sequenceId = saved.rows[0].id;
  expect((await pool.query('SELECT "delayHours" FROM "ClientEmailSequenceStep" WHERE "sequenceId"=$1', [sequenceId])).rows).toEqual([{ delayHours: 2 }]);
  await page.reload();
  await page.getByRole("row").filter({ hasText: "Synthetic sequence version one" }).getByRole("link", { name: "Edit", exact: true }).click();
  await expect(page).toHaveURL((url) => url.searchParams.get("sequenceId") === sequenceId && url.searchParams.get("edit") === "1");
  // Streaming can retain a hidden S:1 copy outside main. Assert the actual
  // visible editor, retaining strict uniqueness instead of choosing the first copy.
  const editor = page.getByRole("main").locator("details:visible").filter({ has: page.locator("summary", { hasText: /^Edit sequence$/ }) });
  await expect(editor).toHaveCount(1);
  await expect(editor).toHaveAttribute("open", "");
  await expect(page.getByRole("textbox", { name: "Sequence name", exact: true })).toHaveValue("Synthetic sequence version one");
  await page.getByRole("textbox", { name: "Sequence name", exact: true }).fill("Synthetic sequence version two");
  await page.locator('input[name="delayHours_INTRODUCTION"]:visible').fill("3");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Updated — Synthetic sequence version two");
  await page.getByRole("link", { name: "Open saved sequence", exact: true }).click();
  await expect(page).toHaveURL((url) => url.searchParams.get("sequenceId") === sequenceId && !url.searchParams.has("edit"));
  await expect(page.getByRole("row").filter({ hasText: "Synthetic sequence version two" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("row").filter({ hasText: "Synthetic sequence version two" })).toBeVisible();
  expect((await pool.query('SELECT "delayHours" FROM "ClientEmailSequenceStep" WHERE "sequenceId"=$1', [sequenceId])).rows).toEqual([{ delayHours: 3 }]);
  expect((await pool.query('SELECT id FROM "OutboundEmail" WHERE "clientId"=$1', [clientId])).rowCount).toBe(0);
});
