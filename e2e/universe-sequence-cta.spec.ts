/**
 * Row 146 — Universe has no link forward to sequence creation.
 *
 * Creating a client list from Universe works and is well-labelled, but the
 * success message left an operator who does not already know the product's
 * two-step model (list, then separately a sequence under Clients ->
 * Outreach) with no signal where to go next. This journey drives the real
 * form — select a fixture Universe contact, choose the client workspace,
 * name the list, submit — and asserts the success message carries a "build a
 * sequence" link that resolves to THAT client's Outreach tab, not a generic
 * or hardcoded one.
 *
 * SEND SAFETY — this only creates a `ContactList`/`ContactListMember` row via
 * `createListFromUniverseAction`. No template, sequence, enrollment or
 * outbound email is ever created by this spec, so there is nothing here that
 * could send.
 */
import { expect, test } from "@playwright/test";

import { E2E_CLIENT, E2E_STORAGE_STATE, E2E_UNIVERSE_CONTACT } from "./fixtures";

test.describe("Universe — build a sequence with this list", () => {
  test.use({ storageState: E2E_STORAGE_STATE.superAdmin });

  test("creating a list surfaces a CTA into the correct client's Outreach tab", async ({
    page,
  }) => {
    await page.goto(`/universe?q=${encodeURIComponent(E2E_UNIVERSE_CONTACT.fullName)}`);

    const content = page.getByRole("main");
    const row = content.getByRole("row", { name: new RegExp(E2E_UNIVERSE_CONTACT.fullName) });
    await expect(row).toBeVisible();
    await row.getByRole("checkbox").check();

    // The client picker is a Base UI Select — its trigger carries no
    // form-label association Playwright's `getByLabel` can follow, so it is
    // targeted by its stable `data-slot` instead (there is only one on this
    // page; the native `<select>` filters above it are NOT this control).
    await content.locator('[data-slot="select-trigger"]').click();
    await page.getByRole("option", { name: E2E_CLIENT.name }).click();

    const listName = `E2E CTA list ${Date.now()}`;
    await content.getByLabel("List name").fill(listName);

    await content.getByRole("button", { name: "Create list" }).click();

    await expect(content.getByText(/Created list/)).toBeVisible();

    const cta = content.getByRole("link", {
      name: `Build a sequence with "${listName}"`,
    });
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute("href", `/clients/${E2E_CLIENT.id}/outreach`);

    await cta.click();
    await expect(page).toHaveURL(new RegExp(`/clients/${E2E_CLIENT.id}/outreach`));
  });
});
