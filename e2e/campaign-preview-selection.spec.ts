import { expect, test } from "@playwright/test";
import { Pool } from "pg";
import { E2E_DATABASE_URL } from "./env";
import { E2E_MEMBER_A, E2E_STORAGE_STATE } from "./fixtures";
import { assertSafeTestDatabase } from "./safe-database";

test.use({ storageState: E2E_STORAGE_STATE.memberA, trace: "retain-on-failure" });
test.describe.configure({ retries: 0 });
const clientId = "e2e-campaign-preview-selection";
const alpha = `${clientId}-alpha`, beta = `${clientId}-beta`;
let pool: Pool;

test.beforeAll(async () => {
  pool = new Pool({ connectionString: assertSafeTestDatabase(E2E_DATABASE_URL).toString() });
  await pool.query(`INSERT INTO "Client" (id,name,slug,"inboundIngestToken",status,"defaultSenderEmail","updatedAt") VALUES ($1,'Synthetic preview workspace',$1,$1,'ACTIVE','preview@example.test',NOW())`, [clientId]);
  await pool.query(`INSERT INTO "ClientMembership" (id,"clientId","staffUserId",role) SELECT $1,$1,id,'CONTRIBUTOR' FROM "StaffUser" WHERE "entraObjectId"=$2`, [clientId, E2E_MEMBER_A.entraObjectId]);
  await pool.query(`INSERT INTO "ContactList" (id,name,"clientId","updatedAt") VALUES ($1,'Empty preview list',$1,NOW())`, [clientId]);
  await pool.query(`INSERT INTO "ClientMailboxIdentity" (id,"clientId",provider,email,"emailNormalized","connectionStatus","isSendingEnabled","canSend","connectedAt","senderSignatureText","updatedAt") VALUES ($1,$1,'GOOGLE','preview@example.test','preview@example.test','CONNECTED',true,true,NOW(),'Synthetic signature',NOW())`, [clientId]);
  for (const [id, name, date] of [[alpha, "Alpha preview campaign", "2026-01-01"], [beta, "Beta preview campaign", "2026-02-01"]]) {
    await pool.query(`INSERT INTO "ClientEmailSequence" (id,"clientId","contactListId",name,"updatedAt") VALUES ($1,$2,$2,$3,$4)`, [id, clientId, name, date]);
    for (const [category, position, subject] of [["INTRODUCTION", 0, `${name} intro`], ["FOLLOW_UP_1", 1, `${name} follow-up`]] as const) {
      const templateId = `${id}-${category}`;
      await pool.query(`INSERT INTO "ClientEmailTemplate" (id,"clientId",name,category,subject,content,"updatedAt") VALUES ($1,$2,$3,$4,$3,'Hello {{first_name}}. Synthetic preview only.',NOW())`, [templateId, clientId, subject, category]);
      await pool.query(`INSERT INTO "ClientEmailSequenceStep" (id,"sequenceId","templateId",category,position,"updatedAt") VALUES ($1,$2,$1,$3,$4,NOW())`, [templateId, id, category, position]);
    }
  }
});

test.afterAll(async () => {
  await pool?.query('DELETE FROM "ClientEmailSequence" WHERE "clientId"=$1', [clientId]);
  await pool?.query('DELETE FROM "ContactList" WHERE "clientId"=$1', [clientId]);
  await pool?.query('DELETE FROM "Client" WHERE id=$1', [clientId]);
  await pool?.end();
});

test("staff preview follows the opened campaign and discards stale selections and responses", async ({ page }) => {
  await page.goto(`/clients/${clientId}/outreach`);
  const main = page.getByRole("main");
  const openCampaign = (name: string) => main.getByRole("row").filter({ hasText: name }).getByRole("link", { name: "Open", exact: true }).click();
  const panel = main.getByRole("region", { name: "Pre-send preview", exact: true });
  const sequence = panel.getByRole("combobox", { name: "Preview sequence", exact: true });
  const step = panel.getByRole("combobox", { name: "Preview step", exact: true });
  const generate = panel.getByRole("button", { name: "Generate preview", exact: true });
  const frame = panel.locator('iframe[title="Email preview"]');
  await openCampaign("Alpha preview campaign");
  await expect(sequence).toHaveValue(alpha);
  await generate.click();
  await expect(panel).toContainText("Alpha preview campaign intro");
  await expect(frame).toBeVisible();
  await step.selectOption("FOLLOW_UP_1");
  await expect(frame).toHaveCount(0);
  await generate.click();
  await expect(panel).toContainText("Alpha preview campaign follow-up");
  await openCampaign("Beta preview campaign");
  await expect(sequence).toHaveValue(beta);
  await expect(frame).toHaveCount(0);
  await sequence.selectOption(alpha);
  let releaseResponse!: () => void;
  const release = new Promise<void>(resolve => { releaseResponse = resolve; });
  let responseReady = false;
  await page.route(url => url.pathname === `/clients/${clientId}/outreach`, async route => {
    const body = route.request().postData() ?? "";
    if (route.request().method() !== "POST" || !body.includes(alpha) || !body.includes("INTRODUCTION")) return route.continue();
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    responseReady = true;
    await release;
    await route.fulfill({ response });
    await response.dispose();
  });
  try {
    await generate.click();
    await expect.poll(() => responseReady).toBe(true);
    await sequence.selectOption(beta);
  } finally {
    releaseResponse();
  }
  await expect(generate).toBeEnabled();
  await expect(frame).toHaveCount(0);
  await generate.click();
  await expect(panel).toContainText("Beta preview campaign intro");
  expect((await pool.query('SELECT id FROM "OutboundEmail" WHERE "clientId"=$1', [clientId])).rowCount).toBe(0);
});
