/**
 * Queue item 99 — there was no operator-facing screen anywhere in the product
 * to set `Client.defaultSenderEmail`, for any client. That field is read in
 * the real send path (`send-introduction.ts`) as the fallback identity for
 * the mailto unsubscribe rail whenever a client has no verified
 * sender-aligned link domain — the normal case, not an edge case. Until row
 * 99, the only remedy was a hand-edit direct to production (see row 98),
 * which cost a real launch two cycles to diagnose.
 *
 * This spec drives the real Mailboxes screen, not the server action in
 * isolation: this repository's signature defect is something built, wired,
 * reporting success, and never actually firing on screen.
 *
 * SEND SAFETY: no email is sent. The write goes to `E2E_CLIENT`, the
 * dedicated e2e fixture workspace on the e2e-only database — never
 * `bidlowai` or any real client. Confirmed against `e2e/seed-e2e.ts`, which
 * upserts `E2E_CLIENT` with no `defaultSenderEmail`, so the field starts
 * null on every run.
 */
import { expect, test } from "@playwright/test";

import { E2E_CLIENT, E2E_MAILBOXES, E2E_STORAGE_STATE } from "./fixtures";

const MAILBOXES_URL = `/clients/${E2E_CLIENT.id}/mailboxes`;
const FIELD_LABEL = /default sender email/i;

test.use({ storageState: E2E_STORAGE_STATE.superAdmin });

// Both tests mutate the SAME fixture client's `defaultSenderEmail` — Playwright's
// `fullyParallel` default would race them against one shared row. Serial mode
// keeps declaration order (round-trip test first, leaving the field null again)
// so the invalid-value test starts from a known-empty field.
test.describe.configure({ mode: "serial" });

test.describe("Client default sender email is operator-settable", () => {
  test("an operator can set it, and it survives a reload (proves the field round-trips to the database)", async ({
    page,
  }) => {
    await page.goto(MAILBOXES_URL);
    const content = page.getByRole("main");

    // Positive control: land on the real client's mailboxes tab, not an
    // empty/error page — without it every assertion below would pass just as
    // happily on a broken route.
    await expect(content.getByText(E2E_MAILBOXES[0]!.email).first()).toBeVisible();

    const input = content.getByLabel(FIELD_LABEL);
    await expect(
      input,
      "no control exists to set the client's default sender email — this is queue row 99's gap",
    ).toBeVisible();
    await expect(input).toHaveValue("");

    const testEmail = `e2e-default-sender-${Date.now()}@example.test`;
    await input.fill(testEmail);
    await content.getByRole("button", { name: /save default sender email/i }).click();

    await expect(
      content.getByText(/default sender email saved/i),
      "the save did not report success on screen",
    ).toBeVisible();

    // Reload from a clean navigation — proves the value was written to the
    // database and re-read, not just held in component state.
    await page.goto(MAILBOXES_URL);
    await expect(content.getByText(E2E_MAILBOXES[0]!.email).first()).toBeVisible();
    await expect(content.getByLabel(FIELD_LABEL)).toHaveValue(testEmail);

    // Clean up so this fixture client stays null for the next run, matching
    // the seed's starting state.
    await content.getByLabel(FIELD_LABEL).fill("");
    await content.getByRole("button", { name: /save default sender email/i }).click();
    await expect(content.getByText(/default sender email cleared/i)).toBeVisible();
  });

  test("a clearly-invalid value is refused on screen, not silently accepted", async ({
    page,
  }) => {
    await page.goto(MAILBOXES_URL);
    const content = page.getByRole("main");
    await expect(content.getByText(E2E_MAILBOXES[0]!.email).first()).toBeVisible();

    const input = content.getByLabel(FIELD_LABEL);
    await input.fill("not-an-email");
    await content.getByRole("button", { name: /save default sender email/i }).click();

    await expect(content.getByText(/enter a valid email address/i)).toBeVisible();

    // Reload and confirm nothing was written.
    await page.goto(MAILBOXES_URL);
    await expect(content.getByLabel(FIELD_LABEL)).toHaveValue("");
  });
});
