import { expect, test } from "@playwright/test";
import { Pool } from "pg";
import { E2E_STAFF, E2E_STORAGE_STATE } from "./fixtures";
import { E2E_DATABASE_URL } from "./env";
import { assertSafeTestDatabase } from "./safe-database";

test.describe("ordinary OpenDoors staff", () => {
  test.describe.configure({ retries: 0 });
  test.use({ trace: "retain-on-failure" });
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
    await page.getByRole("navigation", { name: "Client workspace" }).getByRole("link", { name: "Brief", exact: true }).click();
    await expect(page.getByLabel("Website")).toBeVisible();
    // A previously loaded page may hold obsolete action identifiers after a
    // release. Reject that transport: the stable save URL must still work.
    await page.route(u => u.pathname.startsWith(`/clients/${id}`), async route => {
      if (route.request().method() === "POST") await route.abort("failed");
      else await route.continue();
    });
    await page.route("**/api/brief/taxonomy?*", route => route.fulfill({ status: 503, contentType: "application/json", body: '{"ok":false}' }));
    await page.getByLabel("Website", { exact: true }).fill("https://staff-onboarding.example.test");
    await page.getByLabel("Search address (postcode or street)").fill("PE9 1AA");
    await expect(page.getByText(/Address search is unavailable/)).toBeVisible();
    await page.getByLabel("Address line 1", { exact: true }).fill("1 Synthetic Road");
    await page.getByLabel("City / town").fill("Stamford");
    await page.getByLabel("Postal code").fill("PE9 1AA");
    await page.getByLabel("Country", { exact: true }).fill("United Kingdom");
    await page.getByLabel("First name", { exact: true }).fill("Synthetic");
    await page.getByLabel("Last name", { exact: true }).fill("Contact");
    await page.getByLabel("Work email", { exact: true }).fill("contact@example.test");
    await page.getByLabel("Value proposition", { exact: true }).fill("Onboarding survives an unavailable suggestion service.");
    await page.getByLabel("Service or target areas", { exact: true }).fill("Synthetic region");
    await expect(page.getByText(/Suggestions are unavailable/)).toBeVisible();
    await page.getByLabel("Service or target areas", { exact: true }).press("Enter");
    await page.getByRole("button", { name: "Save brief", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Brief saved.");
    await expect(page.getByRole("button", { name: "Save brief", exact: true })).toBeDisabled();
    await page.getByRole("link", { name: "Open saved brief", exact: true }).click();
    await expect(page.getByLabel("Website", { exact: true })).toHaveValue("https://staff-onboarding.example.test");
    await expect(page.getByLabel("Address line 1", { exact: true })).toHaveValue("1 Synthetic Road");
    await expect(page.getByLabel("Work email", { exact: true })).toHaveValue("contact@example.test");
    await expect(page.getByRole("button", { name: "Remove Synthetic region" })).toBeVisible();
    await expect(page.getByLabel("Value proposition", { exact: true })).toHaveValue("Onboarding survives an unavailable suggestion service.");
    expect((await pool.query('SELECT id FROM "ClientOnboarding" WHERE "clientId"=$1', [id])).rowCount).toBe(1);
    const denied = await page.request.post(`/api/clients/${id}/brief`, { headers: { Origin: "https://unrelated.example" }, data: { website: "https://must-not-save.example" } });
    expect(denied.status()).toBe(403);
    expect((await pool.query('SELECT website FROM "Client" WHERE id=$1', [id])).rows[0].website).toBe("https://staff-onboarding.example.test");
    await page.getByLabel("Value proposition", { exact: true }).fill("Saved despite a lost acknowledgement.");
    let lost = false;
    await page.route(`**/api/clients/${id}/brief`, async route => {
      if (!lost && route.request().method() === "POST") {
        lost = true;
        const response = await route.fetch();
        expect(response.ok()).toBe(true);
        await response.dispose();
        await route.abort("failed");
      } else await route.continue();
    });
    await page.getByRole("button", { name: "Save brief", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("could not confirm the save");
    expect(lost).toBe(true);
    await expect(page.getByLabel("Value proposition", { exact: true })).toHaveValue("Saved despite a lost acknowledgement.");
    await expect(page.getByRole("button", { name: "Save brief", exact: true })).toBeDisabled();
    const [checkedBrief] = await Promise.all([
      page.waitForEvent("popup"),
      page.getByRole("link", { name: "Open saved brief", exact: true }).click(),
    ]);
    await expect(checkedBrief.getByLabel("Value proposition", { exact: true })).toHaveValue("Saved despite a lost acknowledgement.");
    await checkedBrief.close();
    expect((await pool.query('SELECT id FROM "OutboundEmail" WHERE "clientId"=$1', [id])).rowCount).toBe(0);
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
