/**
 * Mobile walk — CR-09. Proves the journeys OpensDoors staff actually use
 * between client sites are usable one-handed on a phone.
 *
 * This has never been driven before, on this pass or either previous one
 * (queue row 89). Measurement comes first: every assertion below is something
 * a real phone user would hit — horizontal scroll, text too small to read,
 * a table that cannot be read, or a tap target so small it cannot reliably be
 * hit with a thumb. The fix list is whatever this spec finds failing, not a
 * guess.
 *
 * Viewport is 375x667 (iPhone SE / smallest phone still in real use) — if a
 * screen works there it works on anything bigger.
 *
 * SEND SAFETY: navigation and read-only DOM measurement only. Nothing here
 * submits a form, and the app under test runs with every provider credential
 * blanked (`e2e/env.ts`).
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { E2E_CLIENT, E2E_STORAGE_STATE } from "./fixtures";

const REPORT_DIR = "e2e/.artifacts/mobile-walk";

/** iPhone SE viewport — the smallest phone still in real use. */
const PHONE_VIEWPORT = { width: 375, height: 667 };

/** WCAG 2.5.8 minimum target size. Below this a thumb cannot reliably hit it. */
const MIN_TAP_TARGET_PX = 24;

const CLIENT = E2E_CLIENT.id;

type Journey = {
  readonly name: string;
  readonly url: string;
};

/**
 * The journeys named in queue row 89: the client list, one client's overview,
 * the mailboxes tab, the setup-help page, and the send-preparation screen
 * (the "Live sends" panel on Outreach, carrying the four-at-a-time corporate
 * send gate — `src/lib/outreach/manual-send-window.ts`).
 */
const JOURNEYS: readonly Journey[] = [
  { name: "client-list", url: "/clients" },
  { name: "client-overview", url: `/clients/${CLIENT}` },
  { name: "client-mailboxes", url: `/clients/${CLIENT}/mailboxes` },
  { name: "client-setup-help", url: `/clients/${CLIENT}/setup-help` },
  { name: "client-outreach-send-prep", url: `/clients/${CLIENT}/outreach` },
];

type MobileFinding = {
  readonly scrollWidthPx: number;
  readonly viewportWidthPx: number;
  readonly horizontalOverflowPx: number;
  readonly tinyText: readonly string[];
  readonly unreadableTables: readonly string[];
  readonly smallTapTargets: readonly string[];
};

async function measure(page: Page): Promise<MobileFinding> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));

  const tinyText = await page.evaluate(() => {
    const found = new Set<string>();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent?.trim();
      const parent = node.parentElement;
      if (!text || !parent) continue;
      const rect = parent.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      // A closed <details> panel's children keep a cached, non-zero
      // getBoundingClientRect in Chromium (so re-expanding is instant) even
      // though nothing is painted. checkVisibility() is the one API that
      // accounts for that — rect alone reads a collapsed panel as on-screen.
      if (!parent.checkVisibility()) continue;
      const fontSizePx = parseFloat(getComputedStyle(parent).fontSize);
      if (fontSizePx > 0 && fontSizePx < 12) {
        found.add(`${String(fontSizePx)}px: "${text.slice(0, 50)}"`);
      }
    }
    return [...found];
  });

  // A <table> whose intrinsic width exceeds the viewport is unreadable unless
  // an ancestor gives it its own horizontal scroller (overflow-x auto/scroll)
  // — otherwise the WHOLE PAGE has to scroll sideways to read one table, and
  // a phone user loses the row headers off the left edge doing it.
  const unreadableTables = await page.evaluate(() => {
    const problems: string[] = [];
    document.querySelectorAll("table").forEach((table, index) => {
      if (!table.checkVisibility()) return; // e.g. inside a closed <details>
      const tableWidth = table.getBoundingClientRect().width;
      let hasScrollAncestor = false;
      let el: HTMLElement | null = table.parentElement;
      while (el && el !== document.body) {
        const style = getComputedStyle(el);
        if (
          (style.overflowX === "auto" || style.overflowX === "scroll") &&
          el.getBoundingClientRect().width < tableWidth
        ) {
          hasScrollAncestor = true;
          break;
        }
        el = el.parentElement;
      }
      if (tableWidth > window.innerWidth && !hasScrollAncestor) {
        problems.push(
          `table #${String(index)}: ${String(Math.round(tableWidth))}px wide, no horizontal scroll wrapper`,
        );
      }
    });
    return problems;
  });

  // Interactive controls too small to hit with a thumb. Icon-only buttons and
  // links are the usual offenders; a short inline text link is exempt (it is
  // read, not tapped as a button-shaped target) unless it renders with a
  // near-zero box, which means it cannot be reached at all.
  const smallTapTargets = await page.evaluate((minPx) => {
    const problems: string[] = [];
    document
      .querySelectorAll<HTMLElement>('button, a[href], [role="button"], input, select')
      .forEach((el) => {
        if (!el.checkVisibility()) return; // hidden, or inside a closed <details>
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return; // not on screen at all
        const label = (el.textContent ?? el.getAttribute("aria-label") ?? "").trim().slice(0, 40);
        const isTextLink = el.tagName === "A" && (el.textContent ?? "").trim().length > 0;
        if (isTextLink) return;
        if (rect.height < minPx || rect.width < minPx) {
          problems.push(
            `${el.tagName.toLowerCase()} "${label}": ${String(Math.round(rect.width))}x${String(Math.round(rect.height))}px`,
          );
        }
      });
    return [...new Set(problems)];
  }, MIN_TAP_TARGET_PX);

  return {
    scrollWidthPx: scrollWidth,
    viewportWidthPx: clientWidth,
    horizontalOverflowPx: Math.max(0, scrollWidth - clientWidth),
    tinyText,
    unreadableTables,
    smallTapTargets,
  };
}

test.describe("mobile walk — the journeys that matter at a phone viewport", () => {
  test.use({ storageState: E2E_STORAGE_STATE.superAdmin, viewport: PHONE_VIEWPORT });

  for (const journey of JOURNEYS) {
    test(`${journey.name} (${journey.url})`, async ({ page }) => {
      await page.goto(journey.url, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      const finding = await measure(page);

      await mkdir(path.resolve(REPORT_DIR), { recursive: true });
      await writeFile(
        path.resolve(REPORT_DIR, `${journey.name}.json`),
        JSON.stringify(finding, null, 2),
        "utf8",
      );
      await page.screenshot({
        path: path.resolve(REPORT_DIR, `${journey.name}.png`),
        fullPage: true,
      });

      expect(
        finding.horizontalOverflowPx,
        `${journey.name}: page is ${String(finding.scrollWidthPx)}px wide against a ${String(finding.viewportWidthPx)}px viewport — horizontal scroll`,
      ).toBeLessThanOrEqual(1);

      expect(finding.tinyText, `${journey.name}: text rendered under 12px`).toEqual([]);

      expect(
        finding.unreadableTables,
        `${journey.name}: a table wider than the viewport with no horizontal scroll wrapper`,
      ).toEqual([]);

      expect(
        finding.smallTapTargets,
        `${journey.name}: a control smaller than ${String(MIN_TAP_TARGET_PX)}px — cannot be reliably reached by thumb`,
      ).toEqual([]);
    });
  }
});
