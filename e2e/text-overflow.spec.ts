/**
 * Text must stay inside its own table cell.
 *
 * Greg saw the Replies "Waiting now" helper note draw over the Waiting
 * column. The same thing happens anywhere a cell is nowrap, or a max width
 * caps the cell while the text does not wrap or clip. This walks the main
 * staff, client-workspace and platform screens at the laptop widths people
 * actually use, plus a phone, and fails if one cell's text box intersects a
 * sibling cell.
 *
 * SEND SAFETY: navigation and layout measurement only.
 */
import { expect, test, type Page } from "@playwright/test";

import { E2E_CLIENT, E2E_STORAGE_STATE } from "./fixtures";

const CLIENT = E2E_CLIENT.id;

const VIEWPORTS = [
  { name: "1280", width: 1280, height: 800 },
  { name: "1366", width: 1366, height: 768 },
  { name: "1440", width: 1440, height: 900 },
  { name: "mobile", width: 375, height: 812 },
] as const;

/** Staff screens and one client's workspace. */
const STAFF_PAGES = [
  "/replies",
  "/clients",
  `/clients/${CLIENT}`,
  `/clients/${CLIENT}/mailboxes`,
  `/clients/${CLIENT}/contacts`,
  `/clients/${CLIENT}/activity`,
  `/clients/${CLIENT}/outreach`,
  `/clients/${CLIENT}/templates`,
  `/clients/${CLIENT}/suppression`,
  `/clients/${CLIENT}/brief`,
  "/activity",
  "/contacts",
  "/universe",
  "/suppression",
  "/reporting",
  "/reporting/detail",
  "/operations/outbound",
  "/google-reconnects",
  "/support",
  "/settings",
  "/settings/staff-access",
  "/settings/ai-spend",
] as const;

const PLATFORM_PAGES = ["/platform", "/platform/org_opensdoors"] as const;

type Overlap = {
  text: string;
  owner: string;
  sibling: string;
};

/**
 * Painted text that crosses into another cell. Hidden and clipped overflow
 * does not count: a truncated cell may lay the full string out, then clip it.
 */
async function cellOverlaps(page: Page): Promise<Overlap[]> {
  return page.evaluate(() => {
    const overlaps: Overlap[] = [];
    const cells = [...document.querySelectorAll("td, th")].filter(
      (cell): cell is HTMLElement => cell instanceof HTMLElement && cell.checkVisibility(),
    );

    function clipsAxis(value: string): boolean {
      return value === "hidden" || value === "clip" || value === "auto" || value === "scroll";
    }

    /** The part that is actually painted. Scrolled-away rows are not. */
    function clip(rect: DOMRect, start: HTMLElement | null) {
      let left = rect.left;
      let right = rect.right;
      let top = rect.top;
      let bottom = rect.bottom;
      let el = start;
      while (el) {
        const style = getComputedStyle(el);
        const clipsX = clipsAxis(style.overflowX);
        const clipsY = clipsAxis(style.overflowY);
        if (clipsX || clipsY) {
          const box = el.getBoundingClientRect();
          if (clipsX) {
            left = Math.max(left, box.left);
            right = Math.min(right, box.right);
          }
          if (clipsY) {
            top = Math.max(top, box.top);
            bottom = Math.min(bottom, box.bottom);
          }
          if (right - left <= 1 || bottom - top <= 1) return null;
        }
        el = el.parentElement;
      }
      return { left, right, top, bottom };
    }

    for (const cell of cells) {
      const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const raw = node.textContent ?? "";
        const text = raw.replace(/\s+/g, " ").trim();
        if (!text) continue;
        const parent = node.parentElement;
        if (!parent || !parent.checkVisibility()) continue;
        if (parent.closest("td, th") !== cell) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const rect of range.getClientRects()) {
          const visible = clip(rect, parent);
          if (!visible) continue;
          const table = cell.closest("table");
          for (const other of cells) {
            if (other === cell || cell.contains(other) || other.contains(cell)) continue;
            if (other.closest("table") !== table) continue;
            const box = clip(other.getBoundingClientRect(), other);
            if (!box) continue;
            const width = Math.min(visible.right, box.right) - Math.max(visible.left, box.left);
            const height = Math.min(visible.bottom, box.bottom) - Math.max(visible.top, box.top);
            if (width > 4 && height > 4) {
              overlaps.push({
                text: text.slice(0, 120),
                owner: (cell.innerText || "").replace(/\s+/g, " ").trim().slice(0, 80),
                sibling: (other.innerText || "").replace(/\s+/g, " ").trim().slice(0, 80),
              });
              if (overlaps.length >= 6) return overlaps;
            }
          }
        }
      }
    }
    return overlaps;
  });
}

async function assertPagesClear(page: Page, pages: readonly string[], viewport: (typeof VIEWPORTS)[number]) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  const failures: string[] = [];
  for (const url of pages) {
    const response = await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.locator("h1").first().waitFor({ state: "visible" });
    await page.evaluate(() => document.fonts.ready);
    const status = response?.status() ?? 0;
    if (status >= 400) {
      failures.push(`${url} returned ${String(status)}`);
      continue;
    }
    const overlaps = await cellOverlaps(page);
    for (const overlap of overlaps) {
      failures.push(
        `${viewport.name} ${url}: "${overlap.text}" in "${overlap.owner}" draws over "${overlap.sibling}"`,
      );
    }
  }
  expect(failures, failures.join("\n")).toEqual([]);
}

test.describe("staff and client pages — text stays in its cell", () => {
  test.use({ storageState: E2E_STORAGE_STATE.superAdmin });
  test.describe.configure({ mode: "serial" });

  for (const viewport of VIEWPORTS) {
    test(`no cell text overlaps a sibling at ${viewport.name}`, async ({ page }) => {
      test.setTimeout(240_000);
      await assertPagesClear(page, STAFF_PAGES, viewport);
    });
  }
});

test.describe("platform pages — text stays in its cell", () => {
  test.use({ storageState: E2E_STORAGE_STATE.platformAdmin });

  for (const viewport of VIEWPORTS) {
    test(`no cell text overlaps a sibling at ${viewport.name}`, async ({ page }) => {
      test.setTimeout(120_000);
      await assertPagesClear(page, PLATFORM_PAGES, viewport);
    });
  }
});
