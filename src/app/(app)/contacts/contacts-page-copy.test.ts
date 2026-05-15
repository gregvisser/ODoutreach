import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * PR #138 — Global Contacts duplication cleanup (G10).
 *
 * The `/contacts` route is no longer in the sidebar (see `nav-config.ts`
 * + `staff-handover-copy.test.ts`). The route itself is preserved because
 * it still hosts the cross-client CSV import and per-row send sheet — but
 * the page must point staff at Universe / Sources for the day-to-day flow.
 */

const pagePath = join(process.cwd(), "src/app/(app)/contacts/page.tsx");
const pageSource = readFileSync(pagePath, "utf8");

describe("Global Contacts page (PR #138)", () => {
  it("surfaces a banner redirecting staff to Universe and Sources", () => {
    expect(pageSource).toContain('href="/universe"');
    expect(pageSource).toContain("Sources");
    expect(pageSource).toMatch(/no longer in the sidebar/);
  });

  it("titles itself as a cross-client tools surface (not the staff default)", () => {
    expect(pageSource).toContain("Contacts (cross-client tools)");
  });
});
