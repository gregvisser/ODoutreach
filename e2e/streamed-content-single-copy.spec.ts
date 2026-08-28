/**
 * Queue row 34 — "a flaky e2e test appeared on the prefetch PR".
 *
 * WHAT WAS ACTUALLY HAPPENING. Three different assertions, on three unrelated
 * pages, failed in CI with the same shape: `getByText(X) resolved to 2 elements`
 * on attempt 1, then passed on retry. Measured 2026-08-27 across the 68 CI runs
 * from the first sighting to that morning: 14 such failures in 10 runs. Every
 * one was this class; there were no other strict-mode violations.
 *
 * The cause is not the app rendering twice. It is React's out-of-order
 * streaming, reproduced locally on 22 of 24 page loads and confirmed from the
 * raw HTML: the finished page is delivered inside a `<div hidden id="S:n">` at
 * the END of `<body>` and moved into `<main>` a frame later. For that frame the
 * document holds two identical copies, and an unscoped `getByText` — which is
 * document-wide and strict — sees both. The user never does: the parked copy is
 * `hidden`, and it is gone by the next frame.
 *
 * So the rule this file pins is: **`main` holds exactly one copy**. Assertions
 * about page content belong inside `main`, where the parked copy cannot reach
 * them. If the app ever really does render a page twice — the defect the queue
 * row suspected — the count below goes to 2 and this fails, which no amount of
 * `.first()` in the other specs would have told anyone.
 *
 * SEND SAFETY: three navigations and no clicks. Nothing here submits anything.
 */
import { expect, test } from "@playwright/test";

import { E2E_CLIENT, E2E_OUTBOUND_EMAIL, E2E_STORAGE_STATE } from "./fixtures";

test.use({ storageState: E2E_STORAGE_STATE.superAdmin });

/** Each entry is a string that failed in CI, on the page it failed on. */
const STREAMED = [
  {
    what: "the operations queue diagnostics",
    url: "/operations/outbound",
    marker: "No aged queue rows.",
  },
  {
    what: "the outbound email detail",
    url: `/activity/outbound/${E2E_OUTBOUND_EMAIL.id}`,
    marker: "Routing",
  },
  {
    what: "the mailboxes table",
    url: `/clients/${E2E_CLIENT.id}/mailboxes`,
    marker: "Use Connect on the mailbox row, then return here.",
  },
] as const;

test.describe("streamed pages hold one copy of their content", () => {
  for (const page_ of STREAMED) {
    test(`${page_.what} renders "${page_.marker}" exactly once inside main`, async ({
      page,
    }) => {
      await page.goto(page_.url);

      // `toHaveCount` polls, so this settles rather than racing the stream. It
      // is the assertion the three flaky specs should always have been making.
      await expect(
        page.getByRole("main").getByText(page_.marker, { exact: false }),
        `"${page_.marker}" must appear once in main — twice means the page really is rendering twice`,
      ).toHaveCount(1);
    });
  }
});
