import { test, expect } from "@playwright/test";
import { Pool } from "pg";
import { E2E_DATABASE_URL } from "./env";
import { E2E_STORAGE_STATE } from "./fixtures";
import { assertSafeTestDatabase } from "./safe-database";

test.use({ storageState: E2E_STORAGE_STATE.memberA, viewport: { width: 1280, height: 900 } });

const clientId = "e2e-ai-campaign";
let pool: Pool;

test.beforeAll(async () => {
  pool = new Pool({ connectionString: assertSafeTestDatabase(E2E_DATABASE_URL).toString() });
  await pool.query(
    `INSERT INTO "Client" (id, name, slug, "inboundIngestToken", status, "updatedAt")
     VALUES ($1, $2, $1, $1, 'ACTIVE', NOW())`,
    [clientId, "Synthetic AI campaign client"],
  );
});

test.afterAll(async () => {
  await pool?.query('DELETE FROM "AuditLog" WHERE "clientId" = $1', [clientId]);
  await pool?.query('DELETE FROM "Client" WHERE id = $1', [clientId]);
  await pool?.end();
});

test("creates an AI campaign from Outreach without calling AI or RocketReach", async ({ page }) => {
  await page.goto(`/clients/${clientId}/outreach`);
  const panel = page.getByRole("region", { name: "Create AI campaign" });
  await expect(panel).toBeVisible();
  await panel.getByLabel("Who to contact, and the offer").fill(
    "Contact facilities managers in agriculture and offer a planned maintenance visit.",
  );
  await panel.getByLabel("Job titles, one per line").fill("Facilities Manager");
  await panel.getByLabel("Countries, one per line").fill("United Kingdom");
  await panel.getByLabel("Industries from the RocketReach list, one per line").fill("Agriculture");
  await panel.getByLabel("People to contact").fill("10");
  await panel.getByLabel("RocketReach credits in total").fill("20");
  await panel.getByLabel("RocketReach credits per day").fill("5");
  await panel.getByLabel("Type START AI CAMPAIGN to confirm").fill("START AI CAMPAIGN");
  await panel.getByRole("button", { name: "Start AI campaign" }).click();

  await expect(page).toHaveURL(new RegExp(`/clients/${clientId}/outreach/ai-campaigns/`));
  await expect(page.getByRole("region", { name: "Campaign status" })).toContainText("Finding people");
  await expect(page.getByText("launch again", { exact: false })).toHaveCount(0);

  const campaign = await pool.query(
    'SELECT status FROM "AiOutreachCampaign" WHERE "clientId" = $1',
    [clientId],
  );
  expect(campaign.rowCount).toBe(1);
  expect(campaign.rows[0]?.status).toBe("SOURCING");
  expect((await pool.query('SELECT id FROM "RocketReachPlanRun" WHERE "clientId" = $1', [clientId])).rowCount).toBe(0);
  expect((await pool.query('SELECT id FROM "AiUsageEvent" WHERE "clientId" = $1', [clientId])).rowCount).toBe(0);
});
