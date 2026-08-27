/**
 * The prefetch stampede must not come back — measured in a real browser.
 *
 * Next.js prefetches every `<Link>` that enters the viewport. On a client
 * workspace screen that is the sidebar links, the brand link and the workspace
 * tabs: roughly eighteen `?_rsc=` requests fired at once, on every page load.
 *
 * Measured against production on 2026-08-26 (signed in, after cf5a752 was
 * deployed and verified by hash): App Service returned **503 for ten of them**
 * — /clients, /reporting, /suppression, brief, mailboxes, sources, contacts,
 * templates, outreach and activity. Requested one at a time a moment later, the
 * same paths returned 200 twelve times out of twelve. The single B1 worker
 * serialises the burst and sheds the rest. So the prefetches were not filling
 * the cache, they were failing — and they took a real server-action POST down
 * with them. The symptom Greg reported ("the system takes very long to load")
 * points nowhere near that cause.
 *
 * `prefetch={false}` on the navigation is the fix. `nav-prefetch.test.ts` reads
 * the source and counts the props; this spec is the other half — it drives a
 * signed-in browser and counts what the network actually does, so the guard
 * cannot pass while the behaviour regresses.
 *
 * That difference was not theoretical. This spec was written alongside the fix
 * in `11a9a93` but never committed, so it had never run. Run for the first time
 * on 2026-08-27 it FAILED: 70 route prefetches on `/reporting` and 15 on the
 * client overview. The source guard was green throughout, because it only read
 * `app-sidebar.tsx` and `client-workspace-subnav.tsx` — and the burst was coming
 * from 43 other files, including a filter chip per client and two links per row
 * on `/reporting`, which grow with the customer's data. Both screens measure 0
 * now. The source guard has since been widened to the whole app.
 *
 * Deliberately no retry, no timeout and no wait that would swallow a failed
 * prefetch: a 5xx here is the finding, not noise to be smoothed over.
 *
 * If the App Service plan is ever scaled beyond B1/one instance, re-measure
 * before relaxing this. Do not simply delete it.
 *
 * SEND SAFETY: navigation only. Nothing here submits a form, and the app under
 * test runs with every provider credential blanked (`e2e/env.ts`).
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { E2E_CLIENT, E2E_STORAGE_STATE } from "./fixtures";

const REPORT_DIR = "e2e/.artifacts/nav-prefetch-burst";

/**
 * With prefetching off, a page load should fire no route prefetches at all —
 * the observed count is 0. The ceiling is set at 2 rather than 0 so that adding
 * one deliberate prefetched link somewhere does not fail the build, while the
 * ~18 of the stampede still does. It is nowhere near the ten that production
 * shed.
 */
const PREFETCH_CEILING = 2;

type RscRequest = {
  readonly status: number;
  readonly pathname: string;
};

/** Loads a screen and records every server-component request it triggers. */
async function countRscRequests(page: Page, url: string): Promise<RscRequest[]> {
  const seen: RscRequest[] = [];

  page.on("response", (response) => {
    const parsed = new URL(response.url());
    // `_rsc` is the App Router's server-component payload marker. On an initial
    // page load, with no navigation performed, every one of these is a prefetch.
    if (!parsed.searchParams.has("_rsc")) return;
    seen.push({ status: response.status(), pathname: parsed.pathname });
  });

  await page.goto(url, { waitUntil: "domcontentloaded" });
  // Prefetches are fired by an IntersectionObserver as links enter the viewport,
  // so they land after DOMContentLoaded. `networkidle` is what a human perceives
  // as "the page has settled" and is what the screen walk already uses.
  await page.waitForLoadState("networkidle");

  return seen;
}

test.describe("navigation does not stampede the server on page load", () => {
  test.use({ storageState: E2E_STORAGE_STATE.superAdmin });

  for (const screen of [
    { name: "client-overview", url: `/clients/${E2E_CLIENT.id}` },
    { name: "reporting", url: "/reporting" },
  ]) {
    test(`${screen.name}: fires no burst of route prefetches`, async ({ page }) => {
      const requests = await countRscRequests(page, screen.url);

      await mkdir(path.resolve(REPORT_DIR), { recursive: true });
      await writeFile(
        path.resolve(REPORT_DIR, `${screen.name}.json`),
        JSON.stringify({ screen, count: requests.length, requests }, null, 2),
        "utf8",
      );

      const detail = requests
        .map((r) => `${String(r.status)} ${r.pathname}`)
        .join(", ");

      expect(
        requests.length,
        `${screen.name}: ${String(requests.length)} route prefetches on load — ` +
          `production shed ten of these with 503 on a single B1 worker. [${detail}]`,
      ).toBeLessThanOrEqual(PREFETCH_CEILING);

      // Whatever does get requested must succeed. A shed prefetch is the exact
      // production failure this guard exists for, so surface it rather than
      // letting a low count hide it.
      expect(
        requests.filter((r) => r.status >= 400),
        `${screen.name}: a route prefetch failed`,
      ).toEqual([]);
    });
  }
});
