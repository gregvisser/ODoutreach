/**
 * Screen walk — opens EVERY staff-facing screen as a signed-in super admin and
 * proves it renders cleanly.
 *
 * Why this exists: a client demo walks the product screen by screen. The
 * existing journey specs assert deep behaviour on a handful of pages; nothing
 * proved that the other twenty-odd screens even load. A page that throws during
 * render, logs a React error, or serves a 500 is invisible to unit tests and
 * obvious to the person deciding whether to pay.
 *
 * What each screen must satisfy:
 *   1. the navigation response is not an error status;
 *   2. no uncaught exception reaches the page (`pageerror`);
 *   3. no `console.error` — this is how React reports hydration mismatches and
 *      key warnings, which look like flicker or duplicated rows to a human;
 *   4. an `<h1>` is visible — proves the server component rendered content, not
 *      an empty shell or an error boundary;
 *   5. none of the framework/error-boundary strings are on the page.
 *
 * Timings are RECORDED, not asserted tightly: this runs against a local
 * production build and a local database, so the absolute numbers are a floor
 * for production, not a prediction of it. The 15s ceiling only catches a screen
 * that is broken-slow rather than merely slower than local.
 *
 * SEND SAFETY: navigation only. Nothing here submits a form, and the app under
 * test runs with every provider credential blanked (`e2e/env.ts`).
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { E2E_CLIENT, E2E_OUTBOUND_EMAIL, E2E_STORAGE_STATE } from "./fixtures";

/** Where the walk report is written, for a human to read after a run. */
const REPORT_DIR = "e2e/.artifacts/screen-walk";

/** A screen that takes longer than this is broken, not just slow. */
const LOAD_CEILING_MS = 15_000;

/**
 * Strings that only ever appear when something has gone wrong. Next.js renders
 * the first two from its error boundaries; the third is the App Router's
 * client-side crash screen.
 */
const FAILURE_STRINGS = [
  "Application error: a client-side exception has occurred",
  "This page could not be found",
  "Internal Server Error",
] as const;

/**
 * console.error noise that is not a defect in our code. Kept deliberately
 * short — every entry here is a thing we have stopped watching.
 */
const IGNORED_CONSOLE = [
  // Chromium logs this for any request the page makes that 404s, including
  // the dev-tools probe for /.well-known/appspecific/com.chrome.devtools.json.
  "Failed to load resource: the server responded with a status of 404",
] as const;

type Screen = {
  /** Human name, used as the test title and the report filename. */
  readonly name: string;
  readonly url: string;
  /**
   * Screens that legitimately redirect (e.g. `/` → the landing screen). The
   * final URL is recorded either way; this only suppresses the assertion that
   * the path is unchanged.
   */
  readonly mayRedirect?: boolean;
};

const CLIENT = E2E_CLIENT.id;

/**
 * Every screen a member of staff can reach from the navigation, plus the detail
 * pages reachable by clicking a row. Ordered as a demo would walk them.
 */
const SCREENS: readonly Screen[] = [
  { name: "root", url: "/", mayRedirect: true },
  // Redirects to /reporting by design — Reports is the staff landing page.
  { name: "dashboard", url: "/dashboard", mayRedirect: true },
  { name: "client-list", url: "/clients" },
  { name: "client-new", url: "/clients/new" },

  { name: "client-overview", url: `/clients/${CLIENT}` },
  { name: "client-brief", url: `/clients/${CLIENT}/brief` },
  // Redirects to Brief by design — onboarding was folded into the Brief tab.
  { name: "client-onboarding", url: `/clients/${CLIENT}/onboarding`, mayRedirect: true },
  { name: "client-mailboxes", url: `/clients/${CLIENT}/mailboxes` },
  { name: "client-sources", url: `/clients/${CLIENT}/sources` },
  { name: "client-contacts", url: `/clients/${CLIENT}/contacts` },
  { name: "client-templates", url: `/clients/${CLIENT}/templates` },
  { name: "client-outreach", url: `/clients/${CLIENT}/outreach` },
  { name: "client-activity", url: `/clients/${CLIENT}/activity` },
  { name: "client-suppression", url: `/clients/${CLIENT}/suppression` },

  { name: "replies-needing-a-person", url: "/replies" },
  { name: "activity", url: "/activity" },
  { name: "activity-outbound-detail", url: `/activity/outbound/${E2E_OUTBOUND_EMAIL.id}` },
  { name: "contacts", url: "/contacts" },
  { name: "universe", url: "/universe" },
  { name: "suppression", url: "/suppression" },
  { name: "reporting", url: "/reporting" },
  { name: "reporting-detail", url: "/reporting/detail" },
  { name: "operations-outbound", url: "/operations/outbound" },
  { name: "support", url: "/support" },

  { name: "training", url: "/training" },
  { name: "training-module", url: "/training/mailboxes" },
  { name: "training-staff-handover", url: "/training/staff-handover" },

  { name: "settings", url: "/settings" },
  { name: "settings-branding", url: "/settings/branding" },
  { name: "settings-staff-access", url: "/settings/staff-access" },
  { name: "settings-deleted-workspaces", url: "/settings/deleted-workspaces" },
  { name: "settings-ai-spend", url: "/settings/ai-spend" },
];

type WalkResult = {
  readonly name: string;
  readonly url: string;
  readonly finalUrl: string;
  readonly status: number | null;
  readonly loadMs: number;
  readonly heading: string;
  readonly consoleErrors: readonly string[];
  readonly pageErrors: readonly string[];
  readonly failedRequests: readonly string[];
  readonly text: string;
};

/**
 * Navigates to one screen with every observable channel wired up first, so a
 * failure that happens during the initial render is still captured.
 */
async function walk(page: Page, screen: Screen): Promise<WalkResult> {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];

  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (IGNORED_CONSOLE.some((ignored) => text.includes(ignored))) return;
    consoleErrors.push(text);
  });
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      failedRequests.push(`${String(response.status())} ${response.url()}`);
    }
  });

  const startedAt = Date.now();
  const response = await page.goto(screen.url, { waitUntil: "domcontentloaded" });
  // `networkidle` is what a human perceives as "the page has settled" — it waits
  // for the streamed server-component payload and any client fetches to finish.
  await page.waitForLoadState("networkidle");
  const loadMs = Date.now() - startedAt;

  const heading = await page
    .locator("h1")
    .first()
    .textContent()
    .catch(() => null);

  return {
    name: screen.name,
    url: screen.url,
    finalUrl: new URL(page.url()).pathname,
    status: response?.status() ?? null,
    loadMs,
    heading: heading?.trim() ?? "",
    consoleErrors,
    pageErrors,
    failedRequests,
    text: (await page.locator("body").innerText()).trim(),
  };
}

test.describe("screen walk — every staff screen renders", () => {
  test.use({ storageState: E2E_STORAGE_STATE.superAdmin });

  for (const screen of SCREENS) {
    test(`${screen.name} (${screen.url})`, async ({ page }) => {
      const result = await walk(page, screen);

      await mkdir(path.resolve(REPORT_DIR), { recursive: true });
      await writeFile(
        path.resolve(REPORT_DIR, `${screen.name}.json`),
        JSON.stringify(result, null, 2),
        "utf8",
      );

      expect(
        result.status,
        `${screen.name}: navigation returned ${String(result.status)}`,
      ).toBeLessThan(400);

      expect(
        result.pageErrors,
        `${screen.name}: uncaught exception on the page`,
      ).toEqual([]);

      expect(
        result.consoleErrors,
        `${screen.name}: console.error during render`,
      ).toEqual([]);

      expect(
        result.heading,
        `${screen.name}: no <h1> rendered — the screen is an empty shell`,
      ).not.toBe("");

      for (const failure of FAILURE_STRINGS) {
        expect(
          result.text,
          `${screen.name}: error-boundary text on screen`,
        ).not.toContain(failure);
      }

      // Raw Markdown. Nothing here renders Markdown, so a `**bold**` or a
      // `code span` written into a copy string is shown to the client with its
      // markers still attached — which is how `**connected**` reached
      // /training/mailboxes. Asserted on the RENDERED text, so it catches copy
      // from any source, not just the files the unit policy test reads.
      const markdownLeaks = result.text
        .split("\n")
        .filter((line) => /\*\*\S/.test(line) || /`[^`\n]{1,60}`/.test(line));
      expect(
        markdownLeaks,
        `${screen.name}: unrendered Markdown markers visible on screen`,
      ).toEqual([]);

      if (!screen.mayRedirect) {
        expect(
          result.finalUrl,
          `${screen.name}: redirected away from the requested screen`,
        ).toBe(screen.url);
      }

      expect(
        result.loadMs,
        `${screen.name}: took ${String(result.loadMs)}ms to settle`,
      ).toBeLessThan(LOAD_CEILING_MS);
    });
  }
});
