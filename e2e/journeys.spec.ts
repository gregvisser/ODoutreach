import { expect, test } from "@playwright/test";

import {
  E2E_CLIENT,
  E2E_CONTACT,
  E2E_OUTBOUND_EMAIL,
  E2E_STORAGE_STATE,
} from "./fixtures";

/**
 * Authenticated critical journeys, run against seeded fixtures with a minted
 * next-auth session cookie (see `e2e/global-setup.ts`).
 *
 * SEND SAFETY — these specs never submit a send. `sendEmailToContactAction` is
 * the real outbound path, and Requeue / Release-stale-locks / Mark-VERIFIED_READY
 * on the operations page mutate live queue state. Assertions stop at "the control
 * is present and enabled". The app under test also runs with every provider
 * credential blanked (`e2e/env.ts`), so a send could not succeed even by mistake.
 *
 * LOCATOR SCOPE — page-content text assertions run against `main`, not the whole
 * document. These routes stream: React parks the finished page inside a
 * `<div hidden id="S:n">` at the END of `<body>` and only moves it into `<main>`
 * a frame later. For that instant the document holds TWO copies of every string
 * on the page, and an unscoped `getByText` is a strict-mode violation. Measured
 * 2026-08-27: 14 such failures across 68 CI runs (three different strings), and
 * 22 of 24 local page loads showed the duplicate. Scoping to `main` excludes the
 * parked copy — which is what the user sees anyway — and is not `.first()`,
 * which would silence the ambiguity without saying which element it meant.
 *
 * Dialog/sheet content is portalled to `<body>`, so it is asserted unscoped.
 */

test.describe("super-admin journeys", () => {
  test.use({ storageState: E2E_STORAGE_STATE.superAdmin });

  test("admin operations page renders queue diagnostics for the seeded workspace", async ({
    page,
  }) => {
    await page.goto("/operations/outbound");
    const content = page.getByRole("main");

    await expect(
      page.getByRole("heading", { name: "Admin operations", level: 1 }),
    ).toBeVisible();

    // Proves the page actually read the database, not just rendered a shell.
    await expect(content.getByText(E2E_CLIENT.name).first()).toBeVisible();

    // The seeded outbound row is SENT, so no queue table can match it.
    await expect(content.getByText("No aged queue rows.")).toBeVisible();
    await expect(content.getByText("No stale processing rows.")).toBeVisible();
  });

  test("outbound email detail renders routing and timeline", async ({ page }) => {
    await page.goto(`/activity/outbound/${E2E_OUTBOUND_EMAIL.id}`);
    const content = page.getByRole("main");

    await expect(
      page.getByRole("heading", { name: "Outbound email", level: 1 }),
    ).toBeVisible();
    await expect(content.getByText("Routing")).toBeVisible();
    await expect(content.getByText("Timeline")).toBeVisible();
    await expect(content.getByText(E2E_OUTBOUND_EMAIL.toEmail).first()).toBeVisible();
    await expect(content.getByText(E2E_OUTBOUND_EMAIL.subject)).toBeVisible();
  });

  test("an unknown outbound email id is not found", async ({ page }) => {
    await page.goto("/activity/outbound/e2e-does-not-exist");

    // Asserted on rendered output, not HTTP status: the page is `force-dynamic`,
    // so the layout has already streamed with a 200 by the time `notFound()`
    // fires. What matters is that no outbound record is disclosed.
    await expect(page.getByRole("heading", { name: "404", level: 1 })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Outbound email", level: 1 }),
    ).toBeHidden();
  });

  test("the compose sheet opens without sending", async ({ page }) => {
    await page.goto(`/contacts?client=${E2E_CLIENT.id}`);
    const content = page.getByRole("main");

    await expect(content.getByText(E2E_CONTACT.email).first()).toBeVisible();

    await page.getByRole("button", { name: "Send", exact: true }).first().click();

    // The sheet renders its compose fields — we stop here, deliberately.
    await expect(page.getByLabel("Subject")).toBeVisible();
    await expect(page.getByLabel("Message")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Send email" }),
    ).toBeVisible();
  });
});

test.describe("staff role boundaries", () => {
  test.use({ storageState: E2E_STORAGE_STATE.staff });

  test("non-super-admin staff are redirected away from admin operations", async ({
    page,
  }) => {
    await page.goto("/operations/outbound");

    await expect(page).toHaveURL(/\/reporting$/);
    await expect(
      page.getByRole("heading", { name: "Reports", level: 1 }),
    ).toBeVisible();
  });

  test("non-super-admin staff can still open an outbound email detail", async ({
    page,
  }) => {
    await page.goto(`/activity/outbound/${E2E_OUTBOUND_EMAIL.id}`);

    await expect(
      page.getByRole("heading", { name: "Outbound email", level: 1 }),
    ).toBeVisible();
  });
});

test.describe("unauthenticated access", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("a protected page redirects to sign-in with a callback url", async ({
    page,
  }) => {
    await page.goto("/operations/outbound");

    await expect(page).toHaveURL(
      /\/sign-in\?callbackUrl=%2Foperations%2Foutbound$/,
    );
  });
});
