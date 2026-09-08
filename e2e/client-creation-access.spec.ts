import { expect, test } from "@playwright/test";
import { Pool } from "pg";
import { E2E_STAFF, E2E_STORAGE_STATE } from "./fixtures";
import { E2E_DATABASE_URL } from "./env";
import { assertSafeTestDatabase } from "./safe-database";

test.describe("ordinary OpenDoors staff", () => {
  test.use({ storageState: E2E_STORAGE_STATE.staff });
  test("can create an audited client from the client list without owner access", async ({ page }) => {
    const pool = new Pool({ connectionString: assertSafeTestDatabase(E2E_DATABASE_URL).toString() });
    const slug = "e2e-ordinary-staff-created-client";
    try {
    await page.goto("/clients");
    await expect(page.getByRole("heading", { name: "Clients", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "New client", exact: true }).first()).toBeVisible();
    await page.getByRole("link", { name: "Add client", exact: true }).click();
    await expect(page).toHaveURL(/\/clients\/new$/);
    await page.getByLabel(/Client name/).fill("Synthetic staff-created client");
    await page.getByLabel(/Workspace ID/).fill(slug);
    await page.getByRole("button", { name: "Create workspace", exact: true }).click();
    await expect(page).toHaveURL(/\/clients\/[^/?]+\?created=1$/);
    const saved = await pool.query('SELECT id,status FROM "Client" WHERE slug=$1', [slug]);
    expect(saved.rowCount).toBe(1);
    expect(saved.rows[0].status).toBe("ONBOARDING");
    const id = saved.rows[0].id;
    const audit = await pool.query('SELECT s."entraObjectId",s."isSuperAdmin" FROM "AuditLog" a JOIN "StaffUser" s ON s.id=a."staffUserId" WHERE a."clientId"=$1 AND a."entityType"=\'Client\' AND a.action=\'CREATE\'', [id]);
    expect(audit.rows).toEqual([{ entraObjectId: E2E_STAFF.entraObjectId, isSuperAdmin: false }]);
    expect((await pool.query('SELECT id FROM "OutboundEmail" WHERE "clientId"=$1', [id])).rowCount).toBe(0);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Synthetic staff-created client", exact: true })).toBeVisible();
    } finally {
      await pool.query('DELETE FROM "Client" WHERE slug=$1', [slug]);
      await pool.end();
    }
  });
});

test.describe("OpenDoors owner", () => {
  test.use({ storageState: E2E_STORAGE_STATE.superAdmin });
  test("retains the client creation form", async ({ page }) => {
    await page.goto("/clients/new");
    await expect(page.getByRole("heading", { name: "Add a client", exact: true })).toBeVisible();
    await expect(page.getByLabel(/Client name/)).toBeVisible();
  });
});
