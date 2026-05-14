import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * PR #135 (system handover audit): the legacy `/dashboard` route is a thin
 * redirect to `/reporting`. The route exists only to preserve old bookmarks
 * and `revalidatePath` history. If anyone adds rendering work back here,
 * this test fails and points them at the audit doc.
 *
 * See `docs/ops/SYSTEM_HANDOVER_READINESS_AUDIT.md` section A.1.
 */
describe("legacy /dashboard route", () => {
  const filePath = join(process.cwd(), "src/app/(app)/dashboard/page.tsx");
  const src = readFileSync(filePath, "utf8");

  it("imports redirect from next/navigation", () => {
    expect(src).toMatch(/from\s+["']next\/navigation["']/);
    expect(src).toMatch(/redirect/);
  });

  it("redirects to /reporting", () => {
    expect(src).toMatch(/redirect\(["']\/reporting["']\)/);
  });

  it("does not render dashboard UI (no JSX, no queries)", () => {
    expect(src).not.toMatch(/<Card/);
    expect(src).not.toMatch(/getDashboardSummaryForStaff/);
    expect(src).not.toMatch(/<StatCard/);
  });
});
