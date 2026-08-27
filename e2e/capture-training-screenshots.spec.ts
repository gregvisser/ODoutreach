/**
 * Recapture the screenshots embedded in the operator training.
 *
 * WHY THIS EXISTS
 *
 * The training in `src/lib/training/modules.ts` is screenshot-led, and the
 * images in `public/training/` were captured by hand in April. When PR #247
 * deleted the Overview's seven-step "workflow strip", the code changed, the
 * tests changed, and the picture did not — so the training kept showing new
 * staff a control that is no longer on the page, next to a tab row using names
 * ("Contacts", "Suppression") that PR #138 had already renamed.
 *
 * A hand-captured asset drifts silently because nothing re-renders it beside
 * the UI it claims to show. This spec makes the capture reproducible, so the
 * fix is "re-run it" rather than "find someone with a login and a cropping
 * tool".
 *
 * NOT PART OF THE CI SUITE. It writes into `public/training/`, which is
 * committed source, so it is skipped unless CAPTURE_TRAINING_SCREENSHOTS is
 * set. CI must never silently rewrite a checked-in asset.
 *
 *   npm run build
 *   CAPTURE_TRAINING_SCREENSHOTS=1 npx playwright test capture-training-screenshots
 *
 * Then review the PNG diff by eye before committing it — this replaces a
 * picture staff are taught from, and no assertion can tell you it looks right.
 *
 * SEND SAFETY: navigation and screenshotting only. No form is submitted, and
 * the app under test runs with every provider credential blanked (`e2e/env.ts`).
 * The workspace photographed is the seeded E2E fixture, never a real client.
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { E2E_CLIENT, E2E_STORAGE_STATE } from "./fixtures";

/**
 * Matches the dimensions the committed screenshots already use — FULL_W/FULL_H
 * in `modules.ts` are 1470×939, and those are declared to Next.js so the
 * training page lays the images out without shift. Capturing at any other size
 * would mean editing those constants too.
 */
const VIEWPORT = { width: 1470, height: 939 } as const;

const TRAINING_IMAGE_DIR = "public/training";

test.use({
  storageState: E2E_STORAGE_STATE.superAdmin,
  viewport: VIEWPORT,
});

test.describe("recapture training screenshots", () => {
  test.skip(
    !process.env.CAPTURE_TRAINING_SCREENSHOTS,
    "Writes committed assets — set CAPTURE_TRAINING_SCREENSHOTS=1 to run.",
  );

  test("client workspace overview", async ({ page }) => {
    await page.goto(`/clients/${E2E_CLIENT.id}`);

    // Wait for the surfaces the training actually names, so we never
    // photograph a half-rendered page and ship it as documentation.
    // These are `CardTitle` divs, not headings — hence getByText, not getByRole.
    await expect(page.getByText("Launch readiness", { exact: true })).toBeVisible();
    await expect(page.getByText("Getting started", { exact: true })).toBeVisible();

    // The point of the recapture: prove the deleted strip is not in the shot.
    await expect(page.getByText("Client setup workflow")).toHaveCount(0);

    await mkdir(TRAINING_IMAGE_DIR, { recursive: true });
    await page.screenshot({
      path: path.join(TRAINING_IMAGE_DIR, "training-overview.png"),
    });
  });
});
