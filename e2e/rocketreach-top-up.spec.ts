import { test, expect } from "@playwright/test";
import { Pool } from "pg";
import { E2E_DATABASE_URL } from "./env";
import { E2E_STORAGE_STATE } from "./fixtures";
import { assertSafeTestDatabase } from "./safe-database";

test.use({ storageState: E2E_STORAGE_STATE.memberA, viewport: { width: 1280, height: 900 } });

const clientId = "e2e-rocketreach-top-up";
const listId = "e2e-rocketreach-top-up-list";
const sequenceId = "e2e-rocketreach-top-up-seq";
let pool: Pool;

test.beforeAll(async () => {
  pool = new Pool({ connectionString: assertSafeTestDatabase(E2E_DATABASE_URL).toString() });
  await pool.query(
    `INSERT INTO "Client" (id, name, slug, "inboundIngestToken", status, "updatedAt")
     VALUES ($1, $2, $1, $1, 'ACTIVE', NOW())`,
    [clientId, "Synthetic top-up client"],
  );
  await pool.query(
    `INSERT INTO "ContactList" (id, name, "clientId", "updatedAt")
     VALUES ($1, 'Synthetic top-up list', $2, NOW())`,
    [listId, clientId],
  );
  await pool.query(
    `INSERT INTO "ClientEmailSequence" (id, "clientId", "contactListId", name, status, "updatedAt")
     VALUES ($1, $2, $3, 'Synthetic top-up sequence', 'DRAFT', NOW())`,
    [sequenceId, clientId, listId],
  );
});

test.afterAll(async () => {
  await pool?.query('DELETE FROM "ClientEmailSequence" WHERE id = $1', [sequenceId]);
  await pool?.query('DELETE FROM "ContactList" WHERE id = $1', [listId]);
  await pool?.query('DELETE FROM "Client" WHERE id = $1', [clientId]);
  await pool?.end();
});

test("shows the credit estimate and an off automatic list top-up without spending", async ({ page }) => {
  await page.goto(`/clients/${clientId}/sources`);
  await expect(page.getByText("This click can use up to", { exact: false }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Run plan into list" })).toHaveCount(0);

  await page.goto(`/clients/${clientId}/outreach?sequenceId=${sequenceId}`);
  const panel = page.getByRole("region", { name: "Automatic list top-up" });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Status: Off");
  await expect(panel.getByRole("button", { name: "Preview top-up" })).toBeVisible();
  await expect(panel.getByText("Greg Visser is the only approver")).toBeVisible();
  await expect(panel.getByText("does not enrol", { exact: false })).toBeVisible();

  for (const table of ["Contact", "OutboundEmail", "RocketReachPlanRun", "SequenceListRefillRule"]) {
    expect((await pool.query(`SELECT id FROM "${table}" WHERE "clientId" = $1`, [clientId])).rowCount).toBe(0);
  }
});
