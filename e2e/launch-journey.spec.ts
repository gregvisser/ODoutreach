/**
 * The Launch journey (queue item 117) — the exact regression row 109 exists to
 * guard against had no browser-driven test at all before this spec. Cycle
 * 134's row-109 fix (client-side `checkValidity()` + try/catch around
 * `requestSubmit()`, plus disabling the trigger while the form action is in
 * flight) shipped with unit-level coverage only — nothing drove a real
 * browser through "sign in, open a client, pick a sequence, click Launch, and
 * see the result reflected on screen."
 *
 * Journey: sign in as staff, open a client whose sequence is genuinely
 * launch-ready (every check in `evaluateSequenceLaunchReadiness` passes —
 * `e2e/fixtures.ts` documents exactly which blockers the fixture clears),
 * click "Launch sequence", confirm in the dialog, and assert the screen shows
 * an outcome a human can read — never silence, never a raw error, which is
 * what row 109 fixed and what this spec now stands guard on.
 *
 * The browser must apply the action result itself. Test-driven navigation
 * would hide the user-visible failure this journey is intended to catch.
 *
 * SEND SAFETY — a confirmed Launch here creates a real `OutboundEmail` row
 * (`status: QUEUED`) in the throwaway e2e database, exactly as it would in
 * production up to that point. It goes no further: `e2e/env.ts` blanks
 * `PROCESS_QUEUE_SECRET` and sets `AUTOPROCESS_OUTBOUND_QUEUE=false`, so
 * `triggerOutboundQueueDrain()` never fires a drain in this process, and the
 * fixture mailbox (`E2E_LAUNCH_MAILBOX`) has no `MailboxIdentitySecret` row —
 * see `e2e/fixtures.ts` for the full chain of why nothing can leave the
 * building. The `bidlowai` client and sequence are never touched by this
 * spec — it runs entirely against the dedicated `E2E_LAUNCH_CLIENT` workspace.
 */
import { expect, test } from "@playwright/test";

import {
  E2E_LAUNCH_CLIENT,
  E2E_LAUNCH_SEQUENCE,
  E2E_STORAGE_STATE,
} from "./fixtures";

test.describe("Launch journey — sequence introduction dispatch", () => {
  test.describe.configure({ retries: 0 });
  test.use({ storageState: E2E_STORAGE_STATE.superAdmin, trace: "retain-on-failure" });

  test("clicking Launch on a ready sequence shows a readable outcome, not silence", async ({
    page,
  }) => {
    await page.goto(
      `/clients/${E2E_LAUNCH_CLIENT.id}/outreach?sequenceId=${E2E_LAUNCH_SEQUENCE.id}`,
    );

    // Scoped to `main`, not the whole document: these routes stream, and
    // React briefly parks a second, hidden copy of the finished page inside
    // a `<div hidden id="S:n">` at the end of `<body>` — see the LOCATOR
    // SCOPE note in `e2e/journeys.spec.ts`.
    const content = page.getByRole("main");
    const selected = content.locator("#outreach-selected-sequence");
    await expect(selected).toBeVisible();

    // The fixture must be GENUINELY launch-ready, not coincidentally blocked —
    // otherwise this spec would pass even if the Launch journey were broken.
    await expect(selected.getByText("Ready to launch")).toBeVisible();
    await expect(selected.getByText("Not ready to launch yet")).toBeHidden();

    const trigger = selected.getByRole("button", { name: "Launch sequence" });
    await expect(trigger).toBeEnabled();
    await trigger.click();

    // Row 109's own words: the confirmation dialog is what stands between a
    // click and a real queued send. Assert its exact copy renders, not just
    // that "something" opened.
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByText("Launch introduction sends?"),
    ).toBeVisible();
    await expect(
      dialog.getByText(/This queues real introduction emails/),
    ).toBeVisible();

    const confirm = dialog.getByRole("button", { name: "Launch sequence" });
    // Capture the action's own response alongside the click: it carries the
    // server's redirect target; the browser must then apply it without help.
    const [actionResponse] = await Promise.all([
      page.waitForResponse(
        (res) => res.request().method() === "POST" && res.url().includes("/outreach"),
      ),
      confirm.click(),
    ]);
    expect(actionResponse.status(), "Launch action did not return a redirect").toBe(303);
    const redirectHeader = actionResponse.headers()["x-action-redirect"];
    if (!redirectHeader) {
      throw new Error(
        "Launch action's response carried no x-action-redirect header — the exact silent failure row 109 exists to prevent.",
      );
    }
    // The flash banner is the ONE `bg-emerald-50` (ok) / `bg-destructive/5`
    // (error) div directly inside the Sequences card — a text-based match
    // would also hit the "Introduction email" dispatch-block heading and its
    // own "N introduction(s) sent" success box, both of which independently
    // report the same underlying count and would otherwise collide. `~=`
    // matches a whole space-separated class TOKEN, so this does not also
    // match the readiness block's own (differently-shaded) `bg-emerald-50/60`.
    const outcomeBanner = content
      .locator("#client-email-sequences")
      .locator('[class~="bg-emerald-50"], [class~="bg-destructive/5"]')
      .first();
    // The exact failure row 109 existed to fix: Greg clicked Launch and
    // nothing told him what happened. Assert the outcome is present, visible,
    // non-empty, and describes what happened to the introduction, not a raw
    // exception or a blank screen.
    await expect(outcomeBanner).toBeVisible({ timeout: 10_000 });

    // The fixture is genuinely launch-ready end to end (proved by running:
    // it creates a real `QUEUED` `OutboundEmail` row — see the SEND SAFETY
    // note above for why that goes no further), so the only readable outcome
    // a healthy Launch journey can produce here is a queued/sent count of at
    // least one. "0 introductions queued" or a destructive/error banner
    // would mean the journey regressed, not that it merely showed some other
    // message — row 109's own failure was silence, not a wrong message, but
    // a regression test that accepts any message at all proves nothing.
    await expect(outcomeBanner).toHaveText(/^[1-9]\d* introductions? (queued|sent)/i);
  });
});
