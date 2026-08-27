/**
 * Queue item 27, defect (6) — "The Mailboxes screen buries the mailboxes."
 *
 * Measured in Chrome on the live site 2026-08-26: four screens of setup and DNS
 * documentation came before the actual table, and the same five mailboxes were
 * then listed AGAIN under Sender signatures, with an identical ~50-word help
 * paragraph repeated verbatim on all four connected rows.
 *
 * The unit tests next to the source assert the ORDER OF THE SOURCE FILE and the
 * dedupe RULE. Neither of those is the defect. The defect is what a person sees
 * on a screen, so this spec measures the rendered document: where the table sits
 * on the page relative to the help, whether the help is closed when you arrive,
 * and how many times the repeated paragraph is actually painted.
 *
 * This repository has shipped six things this week that were built, wired,
 * reported success and never fired. This file exists so that cannot be a
 * seventh.
 *
 * LOCATOR SCOPE — text assertions run against `main`, not the whole document.
 * This route streams: React parks the finished page inside a
 * `<div hidden id="S:n">` at the END of `<body>` and only moves it into `<main>`
 * a frame later, so for one frame the document holds TWO copies of every string
 * on the page and an unscoped `getByText` is a strict-mode violation. Measured
 * 2026-08-27: "Use Connect on the mailbox row, then return here." failed that
 * way in 5 of 68 CI runs. See the same note in `e2e/journeys.spec.ts`.
 *
 * SEND SAFETY: navigation and one disclosure click. Nothing here submits a form.
 * The fixture mailboxes hold no stored credential (see `E2E_MAILBOXES`).
 */
import { expect, test } from "@playwright/test";

import {
  E2E_CLIENT,
  E2E_CONNECTED_MAILBOX_COUNT,
  E2E_MAILBOXES,
  E2E_STORAGE_STATE,
} from "./fixtures";

const MAILBOXES_URL = `/clients/${E2E_CLIENT.id}/mailboxes`;

/** The disclosure everything that used to sit above the table now lives in. */
const SETUP_SUMMARY = "Setup, deliverability and test sends";

/** A help block that was above the table before the fix. */
const HELP_HEADING = "What happens when you connect a mailbox?";

test.use({ storageState: E2E_STORAGE_STATE.superAdmin });

test.describe("Mailboxes shows the mailboxes first", () => {
  test("the mailbox table is painted above the setup help", async ({ page }) => {
    await page.goto(MAILBOXES_URL);
    const content = page.getByRole("main");

    // Positive control: the fixture mailboxes really are on this page. Without
    // it, every assertion below would pass just as happily on an empty page.
    const firstMailbox = content.getByText(E2E_MAILBOXES[0]!.email).first();
    await expect(firstMailbox).toBeVisible();

    const tableBox = await firstMailbox.boundingBox();
    expect(tableBox, "the mailbox table has no position on the page").not.toBeNull();

    const setup = content.getByText(SETUP_SUMMARY, { exact: false }).first();
    await expect(setup).toBeVisible();
    const setupBox = await setup.boundingBox();
    expect(setupBox, "the setup disclosure has no position on the page").not.toBeNull();

    // The measurement the UX walk took: vertical position on the rendered page.
    expect(
      tableBox!.y,
      "a mailbox is still further down the page than the setup help",
    ).toBeLessThan(setupBox!.y);
  });

  test("the setup and DNS help is closed on arrival, and still openable", async ({
    page,
  }) => {
    await page.goto(MAILBOXES_URL);
    const content = page.getByRole("main");

    await expect(
      content.getByText(HELP_HEADING, { exact: false }).first(),
      `"${HELP_HEADING}" is expanded on arrival — the help is still in the way`,
    ).toBeHidden();

    // ...and it is genuinely still reachable, not deleted. If this half fails,
    // the fix threw content away instead of moving it.
    await content.getByText(SETUP_SUMMARY, { exact: false }).first().click();
    await expect(
      content.getByText(HELP_HEADING, { exact: false }).first(),
      `"${HELP_HEADING}" cannot be opened — the help was lost, not collapsed`,
    ).toBeVisible();
  });

  test("the repeated signature advice is printed once, not once per mailbox", async ({
    page,
  }) => {
    await page.goto(MAILBOXES_URL);
    const content = page.getByRole("main");
    await expect(content.getByText(E2E_MAILBOXES[0]!.email).first()).toBeVisible();

    // Every connected fixture mailbox carries a full branded signature, so
    // `getOperatorSignatureState` hands all four the same `ready_od` template.
    // Before the fix this sentence appeared once per connected row.
    const repeated = "Confirm it looks right with Preview signature.";

    // Guard the fixture itself: if the mailboxes were not all in one state
    // there would be nothing to dedupe, and this test would pass green without
    // ever exercising the fix.
    expect(E2E_CONNECTED_MAILBOX_COUNT).toBeGreaterThan(1);

    const body = await page.locator("body").innerText();
    const occurrences = body.split(repeated).length - 1;

    expect(
      occurrences,
      `"${repeated}" appears ${occurrences} times; ${E2E_CONNECTED_MAILBOX_COUNT} connected mailboxes share it, so it must appear once`,
    ).toBe(1);

    // And it must say which mailboxes it applies to — hoisting it out of the
    // table without naming them would trade duplication for ambiguity.
    await expect(
      content.getByText(`Next step for ${E2E_CONNECTED_MAILBOX_COUNT} mailboxes`, {
        exact: false,
      }),
    ).toBeVisible();
  });

  test("advice belonging to a single mailbox stays on that mailbox's row", async ({
    page,
  }) => {
    await page.goto(MAILBOXES_URL);

    // One fixture mailbox never connected. Its advice is shared with no other
    // row, so the dedupe must leave it exactly where it was.
    await expect(
      page.getByRole("main").getByText("Use Connect on the mailbox row, then return here.", {
        exact: false,
      }),
    ).toBeVisible();
  });
});
