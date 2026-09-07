import { test, expect } from "@playwright/test";
import { Pool } from "pg";
import { E2E_DATABASE_URL } from "./env";
import { E2E_CLIENT, E2E_CLIENT_B, E2E_MEMBER_A, E2E_REPLY_RECOVERY, E2E_STORAGE_STATE } from "./fixtures";
import { assertSafeTestDatabase } from "./safe-database";

test.use({ storageState: E2E_STORAGE_STATE.memberA, viewport: { width: 390, height: 844 } });
let pool: Pool;
test.beforeAll(() => { pool = new Pool({ connectionString: assertSafeTestDatabase(E2E_DATABASE_URL).toString() }); });
test.afterAll(async () => { await pool?.end(); });

async function seed(id: string, clientId: string) {
  // A rejection keeps these dedicated rows out of concurrent waiting-queue tests.
  await pool.query(`INSERT INTO "InboundReply" (id, "clientId", "fromEmail", subject, snippet, "receivedAt", "matchMethod", classification)
    VALUES ($1,$2,'historical@example.test','Historical conversation','Saved historical message text',NOW() - INTERVAL '90 days','BY_CONTACT_EMAIL','NOT_INTERESTED')
    ON CONFLICT (id) DO UPDATE SET "handledAt"=NULL, "handledByStaffUserId"=NULL`, [id, clientId]);
}

test("staff can read and handle a historical reply without an outbound link", async ({ page }) => {
  const id = "e2e-orphan-handle";
  await seed(id, E2E_CLIENT.id);
  try {
    await page.goto(`/clients/${E2E_CLIENT.id}/activity/replies/${id}`);
    const main = page.getByRole("main");
    await expect(main).toHaveCount(1);
    await expect(main.getByRole("heading", { name: "Historical conversation", exact: true })).toBeVisible();
    await expect(main.getByText("Saved historical message text", { exact: true })).toBeVisible();
    await expect(main.getByText("The original campaign link is unavailable.", { exact: true })).toBeVisible();
    await expect(main.getByRole("button", { name: /Send reply|Stop follow-ups|Pause follow-ups/i })).toHaveCount(0);
    expect((await pool.query('SELECT id FROM "ReplyClaim" WHERE "subjectId"=$1', [id])).rows).toHaveLength(0);
    await main.getByRole("button", { name: "Mark handled", exact: true }).click();
    await expect(main.getByRole("button", { name: "Mark handled", exact: true })).toHaveCount(0);
    await page.reload();
    await expect(main.getByRole("heading", { name: "Historical conversation", exact: true })).toBeVisible();
    await expect(main.getByRole("button", { name: "Mark handled", exact: true })).toHaveCount(0);
    const result = await pool.query(`SELECT r."linkedOutboundEmailId", r."handledAt", s."entraObjectId"
      FROM "InboundReply" r LEFT JOIN "StaffUser" s ON s.id=r."handledByStaffUserId" WHERE r.id=$1`, [id]);
    expect(result.rows[0].linkedOutboundEmailId).toBeNull();
    expect(result.rows[0].handledAt).toBeTruthy();
    expect(result.rows[0].entraObjectId).toBe(E2E_MEMBER_A.entraObjectId);
  } finally { await pool.query('DELETE FROM "InboundReply" WHERE id=$1', [id]); }
});

test("an invalid surviving campaign link does not qualify for the historical fallback", async ({ page }) => {
  const id = "e2e-orphan-foreign-link";
  const outboundId = "e2e-orphan-foreign-outbound";
  await seed(id, E2E_CLIENT.id);
  await pool.query(`INSERT INTO "OutboundEmail" (id,"correlationId","clientId","toEmail",subject,"bodySnapshot",status)
    VALUES ($1,$1,$2,'other@example.test','Other workspace campaign','Private campaign text','SENT')`, [outboundId, E2E_CLIENT_B.id]);
  await pool.query('UPDATE "InboundReply" SET "linkedOutboundEmailId"=$2 WHERE id=$1', [id, outboundId]);
  try {
    await page.goto(`/clients/${E2E_CLIENT.id}/activity/replies/${id}`);
    await expect(page.getByRole("heading", { name: "404", exact: true })).toBeVisible();
    await expect(page.getByText("Saved historical message text", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Other workspace campaign", { exact: true })).toHaveCount(0);
  } finally {
    await pool.query('DELETE FROM "InboundReply" WHERE id=$1', [id]);
    await pool.query('DELETE FROM "OutboundEmail" WHERE id=$1', [outboundId]);
  }
});

test("an orphan reply requires its owning workspace in the URL", async ({ page }) => {
  const id = "e2e-orphan-denied";
  await seed(id, E2E_CLIENT_B.id);
  try {
    await page.goto(`/clients/${E2E_CLIENT.id}/activity/replies/${id}`);
    await expect(page.getByRole("heading", { name: "404", exact: true })).toBeVisible();
    await expect(page.getByText("Saved historical message text", { exact: true })).toHaveCount(0);
    // OpenDoors staff can access all live workspaces. The record must still be
    // scoped to its actual workspace, rather than accepted under a different ID.
    await page.goto(`/clients/${E2E_CLIENT_B.id}/activity/replies/${id}`);
    await expect(page.getByRole("main").getByRole("heading", { name: "Historical conversation", exact: true })).toBeVisible();
  } finally { await pool.query('DELETE FROM "InboundReply" WHERE id=$1', [id]); }
});

test("a valid linked reply keeps its existing campaign detail view", async ({ page }) => {
  const id = "e2e-orphan-linked-control";
  await seed(id, E2E_REPLY_RECOVERY.clientId);
  await pool.query('UPDATE "InboundReply" SET "linkedOutboundEmailId"=$2 WHERE id=$1', [id, E2E_REPLY_RECOVERY.outboundId]);
  try {
    await page.goto(`/clients/${E2E_REPLY_RECOVERY.clientId}/activity/replies/${id}`);
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { name: "Historical conversation", exact: true })).toBeVisible();
    await expect(main.getByText("Saved historical message text", { exact: true })).toBeVisible();
    await expect(main.getByText("The original campaign link is unavailable.", { exact: true })).toHaveCount(0);
    await expect(main.getByText(/to a sequence email sent from/)).toBeVisible();
    await expect.poll(async () => (await pool.query('SELECT id FROM "ReplyClaim" WHERE "subjectId"=$1', [id])).rowCount).toBe(1);
  } finally {
    await pool.query('DELETE FROM "ReplyClaim" WHERE "subjectId"=$1', [id]);
    await pool.query('DELETE FROM "InboundReply" WHERE id=$1', [id]);
  }
});
