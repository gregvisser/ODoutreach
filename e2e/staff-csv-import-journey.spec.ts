import { expect, test } from "@playwright/test";
import { Pool } from "pg";
import { E2E_DATABASE_URL } from "./env";
import { E2E_MEMBER_A, E2E_STORAGE_STATE } from "./fixtures";
import { assertSafeTestDatabase } from "./safe-database";

test.use({ storageState: E2E_STORAGE_STATE.memberA });
const clientId = "e2e-staff-csv-journey";
const listName = "Synthetic CSV preview and confirmation";
const clearEmail = "csv-journey-clear@example.test";
const blockedEmail = "csv-journey-blocked@example.test";
let pool: Pool;
const csvText = [
  "Name,Employer,Industry,First Name,Last Name,City,Country,Linkedin,Job1 Title,A Emails,Mobile Number,Office Number",
  `CSV Clear,Synthetic Company,Testing,CSV,Clear,Test City,United Kingdom,,Director,${clearEmail},,`,
  `CSV Duplicate,Forbidden Employer,Testing,CSV,Duplicate,Test City,United Kingdom,,Director,${clearEmail.toUpperCase()},,`,
  `CSV Blocked,Synthetic Company,Testing,CSV,Blocked,Test City,United Kingdom,,Director,${blockedEmail},,`,
  "CSV Invalid,Synthetic Company,Testing,CSV,Invalid,Test City,United Kingdom,,Director,not-an-email,,",
].join("\n");
const upload = { name: "synthetic-staff-journey.csv", mimeType: "text/csv", buffer: Buffer.from(csvText) };

test.beforeAll(async () => {
  pool = new Pool({ connectionString: assertSafeTestDatabase(E2E_DATABASE_URL).toString() });
  await pool.query('INSERT INTO "Client" (id,name,slug,"inboundIngestToken",status,"updatedAt") VALUES ($1,$2,$1,$1,\'ACTIVE\',NOW())', [clientId, "Synthetic CSV workspace"]);
  await pool.query(`INSERT INTO "ClientMembership" (id,"clientId","staffUserId",role) SELECT $1,$1,id,'CONTRIBUTOR' FROM "StaffUser" WHERE "entraObjectId"=$2`, [clientId, E2E_MEMBER_A.entraObjectId]);
  await pool.query('INSERT INTO "SuppressedEmail" (id,"clientId",email) VALUES ($1,$1,$2)', [clientId, blockedEmail]);
  await pool.query('INSERT INTO "CompanyDncEntry" (id,"clientId","originalName","canonicalName") VALUES ($1,$1,$2,$3)', [clientId, "Forbidden Employer", "forbidden employer"]);
});

test.afterAll(async () => {
  await pool?.query('DELETE FROM "ContactList" WHERE "clientId"=$1', [clientId]);
  await pool?.query('DELETE FROM "Client" WHERE id=$1', [clientId]);
  await pool?.query('DELETE FROM "ContactUniverse" WHERE "emailNormalized"=ANY($1::text[])', [[clearEmail, blockedEmail]]);
  await pool?.end();
});

test("staff upload, preview, confirm and re-import without duplicate contacts or lost DNC", async ({ page }) => {
  await page.goto(`/clients/${clientId}`);
  await page.getByRole("navigation", { name: "Client workspace", exact: true }).getByRole("link", { name: "Sources", exact: true }).click();
  const preview = page.getByRole("button", { name: "Preview", exact: true });
  const confirm = page.getByRole("button", { name: "Confirm import", exact: true });
  await expect(confirm).toBeDisabled();
  await page.getByRole("textbox", { name: "Or create a new list (required if no existing list selected)", exact: true }).fill(listName);
  await page.getByLabel("CSV file", { exact: true }).setInputFiles(upload);
  await preview.click();
  await expect(confirm).toBeEnabled();
  // The first row's supplied employer must be checked before it exists in DB;
  // the duplicate employer must not replace it or create a false review hold.
  await expect(page.getByRole("row").filter({ hasText: "CSV Clear" })).toContainText("Email-sendable");
  await expect(page.getByRole("row").filter({ hasText: "CSV Blocked" })).toContainText("Suppressed");
  expect((await pool.query('SELECT id FROM "Contact" WHERE "clientId"=$1', [clientId])).rowCount).toBe(0);
  expect((await pool.query('SELECT id FROM "ContactList" WHERE "clientId"=$1', [clientId])).rowCount).toBe(0);

  // Changing the uploaded file invalidates the previous approval to import.
  await page.getByLabel("CSV file", { exact: true }).setInputFiles({ ...upload, name: "synthetic-reviewed.csv" });
  await expect(confirm).toBeDisabled();
  await preview.click();
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(page.getByRole("status").filter({ hasText: "Import saved" })).toBeVisible();
  await expect(confirm).toBeDisabled();
  await page.getByRole("link", { name: "Open import result", exact: true }).click();
  await expect(page).toHaveURL(/\/sources\?import=ok&/);

  const contacts = await pool.query('SELECT email,"isSuppressed" FROM "Contact" WHERE "clientId"=$1 ORDER BY email', [clientId]);
  expect(contacts.rows).toEqual([
    { email: blockedEmail, isSuppressed: true },
    { email: clearEmail, isSuppressed: false },
  ]);
  const list = await pool.query('SELECT id,name FROM "ContactList" WHERE "clientId"=$1', [clientId]);
  expect(list.rows).toEqual([{ id: expect.any(String), name: listName }]);
  await page.reload();
  await page.getByRole("link", { name: listName, exact: true }).click();
  await expect(page.getByText(clearEmail, { exact: true })).toBeVisible();
  await expect(page.getByText(blockedEmail, { exact: true })).toBeVisible();

  await page.getByRole("navigation", { name: "Client workspace", exact: true }).getByRole("link", { name: "Sources", exact: true }).click();
  await page.getByRole("combobox", { name: "Use existing list (optional)", exact: true }).selectOption(list.rows[0].id);
  // Re-import does not overwrite an existing employer with the uploaded one.
  await page.getByLabel("CSV file", { exact: true }).setInputFiles({ ...upload, buffer: Buffer.from(csvText.replace("CSV Clear,Synthetic Company", "CSV Clear,Forbidden Employer")) });
  await preview.click();
  await expect(confirm).toBeEnabled();
  await expect(page.getByRole("row").filter({ hasText: "CSV Clear" })).toContainText("Email-sendable");
  await confirm.click();
  await expect(page.getByRole("status").filter({ hasText: "Import saved" })).toBeVisible();
  await expect(confirm).toBeDisabled();
  await page.getByRole("link", { name: "Open import result", exact: true }).click();
  await expect(page).toHaveURL(/\/sources\?import=ok&/);
  expect((await pool.query('SELECT id FROM "Contact" WHERE "clientId"=$1', [clientId])).rowCount).toBe(2);
  expect((await pool.query('SELECT id FROM "ContactListMember" WHERE "contactListId"=$1', [list.rows[0].id])).rowCount).toBe(2);
  expect((await pool.query('SELECT "isSuppressed" FROM "Contact" WHERE "clientId"=$1 AND email=$2', [clientId, blockedEmail])).rows).toEqual([{ isSuppressed: true }]);
  expect((await pool.query('SELECT id FROM "OutboundEmail" WHERE "clientId"=$1', [clientId])).rowCount).toBe(0);

  // A saved import whose acknowledgement is lost must not invite another submission.
  await page.getByRole("combobox", { name: "Use existing list (optional)", exact: true }).selectOption(list.rows[0].id);
  await page.getByLabel("CSV file", { exact: true }).setInputFiles(upload);
  await preview.click();
  await expect(confirm).toBeEnabled();
  let intercepted = false;
  await page.route(`**/clients/${clientId}/sources*`, async route => {
    if (route.request().method() !== "POST" || intercepted) return route.continue();
    intercepted = true;
    await route.fetch(); // Let the server persist the import before losing only its response.
    await route.abort("failed");
  });
  await confirm.click();
  await expect(page.getByRole("alert").filter({ hasText: "Records may already have been saved" })).toBeVisible();
  expect(intercepted).toBe(true);
  await expect(confirm).toBeDisabled();
  await page.getByRole("link", { name: "Refresh import lists", exact: true }).click();
  await page.getByRole("link", { name: listName, exact: true }).click();
  await expect(page.getByText(blockedEmail, { exact: true })).toBeVisible();
  expect((await pool.query('SELECT id FROM "ContactListMember" WHERE "contactListId"=$1', [list.rows[0].id])).rowCount).toBe(2);
  expect((await pool.query('SELECT "isSuppressed" FROM "Contact" WHERE "clientId"=$1 AND email=$2', [clientId, blockedEmail])).rows).toEqual([{ isSuppressed: true }]);
  expect((await pool.query('SELECT id FROM "OutboundEmail" WHERE "clientId"=$1', [clientId])).rowCount).toBe(0);
});
