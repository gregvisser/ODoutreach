/**
 * Regenerates the screenshots shipped with the staff training.
 *
 * Why this exists: `/public/training/training-overview.png` was captured by
 * hand in PR #58 and then went stale twice without anyone noticing — PR #138
 * renamed two workspace tabs, and PR #247 deleted the numbered "Workflow" pill
 * strip entirely. The image kept showing both for months, so the training
 * taught staff to look for a screen element that no longer renders.
 *
 * A hand-captured PNG has no gate. This spec gives it one: the image can be
 * rebuilt from the running app on demand, at the 1440x900 the training
 * checklist already commits to.
 *
 * It is OPT-IN and does not run in CI — capturing writes into `public/`, which
 * is a source directory, and a spec that mutates tracked files on every run
 * would make every unrelated e2e run dirty the working tree.
 *
 *   npm run build
 *   CAPTURE_TRAINING_SCREENSHOTS=1 npx playwright test e2e/training-screenshots.spec.ts
 *
 * Review the diff before committing — this is client-facing training material.
 */
import path from "node:path";

import { expect, test } from "@playwright/test";

import { E2E_CLIENT, E2E_STORAGE_STATE } from "./fixtures";

const CAPTURE = process.env.CAPTURE_TRAINING_SCREENSHOTS === "1";

/** Matches the "Window is at 1440x900" line in the staff video checklists. */
const TRAINING_VIEWPORT = { width: 1440, height: 900 } as const;

const PUBLIC_TRAINING_DIR = path.join(process.cwd(), "public", "training");

/**
 * Staff, deliberately — not the super admin. The training video checklists
 * already say "signed in as an OpensDoors staff member (not as an admin)", and
 * owner-only diagnostics must not appear in client-facing training material.
 */
test.use({ storageState: E2E_STORAGE_STATE.staff, viewport: TRAINING_VIEWPORT });

test.describe("training screenshots", () => {
  test.skip(!CAPTURE, "opt-in: set CAPTURE_TRAINING_SCREENSHOTS=1");

  test("client workspace overview", async ({ page }) => {
    await page.goto(`/clients/${E2E_CLIENT.id}`);
    await page.waitForLoadState("networkidle");

    // Assert the frame before saving it. A screenshot of an error boundary, a
    // sign-in redirect or a half-loaded page is worse than a stale one, because
    // it looks deliberate. `CardTitle` renders a div, so match on text.
    expect(new URL(page.url()).pathname).toBe(`/clients/${E2E_CLIENT.id}`);
    await expect(page.getByText("Launch readiness", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Do-not-contact", exact: true })).toBeVisible();

    // The element this whole exercise is about. If it ever comes back, the
    // capture should fail rather than quietly re-introduce it to the training.
    await expect(page.getByText("Client setup workflow")).toHaveCount(0);

    // Full page, not just the viewport: Launch readiness sits below the fold at
    // 1440x900, and the caption in `modules.ts` promises the reader will see it.
    // A caption describing something cropped out of its own screenshot is the
    // same defect this file exists to stop.
    await page.screenshot({
      path: path.join(PUBLIC_TRAINING_DIR, "training-overview.png"),
      fullPage: true,
    });
  });
});
