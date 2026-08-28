/**
 * The app under test must not talk to anything outside the machine.
 *
 * Why this exists: `e2e/env.ts` blanks every provider credential so a test can
 * never reach a real send. That guard works by emptying environment variables —
 * so it only covers destinations that are CONFIGURED from the environment. A
 * destination hardcoded in the source is invisible to it.
 *
 * That gap had a cost. The Sentry DSN was written into `instrumentation-client.ts`
 * as a literal, so every e2e run in CI, and every local `npm run start`, shipped
 * browser telemetry into the CLIENT'S PRODUCTION Sentry project at
 * `tracesSampleRate: 1` (100% of traces) with `enableLogs: true`. When that
 * project's ingest quota ran out, Sentry answered the browser with `429`, the
 * browser logged `Failed to load resource: the server responded with a status of
 * 429 ()`, and `screen-walk.spec.ts` failed its `console.error` assertion on
 * every retry — a hard red on a run that had changed nothing but documentation.
 *
 * The 429 itself is NOT reproducible on demand: it depends on an external
 * quota that refills. So this spec does not assert the symptom. It asserts the
 * precondition that made the symptom possible — that a screen sends anything at
 * all to a host we do not control. That is deterministic, and it is the thing
 * worth forbidding: this is a Tier P product whose pages render real client
 * contact data, and a test environment must not be a data egress path.
 *
 * SEND SAFETY: navigation only. Nothing here submits a form.
 */
import { expect, test, type Page } from "@playwright/test";

import { E2E_BASE_URL } from "./env";
import { E2E_CLIENT, E2E_STORAGE_STATE } from "./fixtures";

/**
 * The two screens that actually caught this in CI. Both are `redirect()`-during-
 * render routes, so the browser renders two pages' worth of instrumentation for
 * one navigation — which is why they exhausted the quota before the terminal
 * screens did. Kept as the sample rather than the whole walk: the failure is a
 * property of the client bundle, which every screen shares.
 */
const SCREENS: readonly { readonly name: string; readonly url: string }[] = [
  { name: "dashboard", url: "/dashboard" },
  { name: "client-onboarding", url: `/clients/${E2E_CLIENT.id}/onboarding` },
];

/** The origin the app under test is served from. Everything else is off-machine. */
const LOCAL_ORIGIN = new URL(E2E_BASE_URL).origin;

/**
 * Records every request the page makes to an origin other than the app's own,
 * including ones made after first paint (telemetry is flushed late).
 */
async function offMachineRequests(page: Page, url: string): Promise<string[]> {
  const external: string[] = [];

  page.on("request", (request) => {
    const requestUrl = request.url();
    // `data:` and `blob:` never leave the browser.
    if (!requestUrl.startsWith("http://") && !requestUrl.startsWith("https://")) {
      return;
    }
    if (new URL(requestUrl).origin === LOCAL_ORIGIN) return;
    external.push(`${request.method()} ${requestUrl}`);
  });

  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");

  return external;
}

test.describe("the test environment is not a data egress path", () => {
  test.use({ storageState: E2E_STORAGE_STATE.superAdmin });

  for (const screen of SCREENS) {
    test(`${screen.name} sends nothing off the machine`, async ({ page }) => {
      const external = await offMachineRequests(page, screen.url);

      expect(
        external,
        `${screen.name}: the app under test sent request(s) to a host we do not ` +
          `control. A test run must not reach a third party — and if that third ` +
          `party rate-limits us, its 429 lands in the browser console and reds ` +
          `the screen walk.`,
      ).toEqual([]);
    });
  }
});
