import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { mainNav } from "@/components/app-shell/nav-config";

/**
 * PR #140 — Global Activity demotion (G11).
 *
 * Per-client Activity is the trusted operational view:
 *   * groups replies by mailbox,
 *   * links into the reply-detail page,
 *   * surfaces stop-follow-ups,
 *   * hides random mailbox inbox mail (`hideInboxMail` policy on the
 *     client Activity page).
 *
 * Global Activity has historically duplicated this view and routinely
 * confuses operators. PR #140 demotes it to admin-only and removes it
 * from the sidebar. The route itself is preserved as a cross-client
 * debug surface so admins can still inspect provider events globally.
 */

const PAGE_PATH = join(process.cwd(), "src/app/(app)/activity/page.tsx");
const PAGE_SOURCE = readFileSync(PAGE_PATH, "utf8");

const CLIENT_ACTIVITY_PATH = join(
  process.cwd(),
  "src/app/(app)/clients/[clientId]/activity/page.tsx",
);
const CLIENT_ACTIVITY_SOURCE = readFileSync(CLIENT_ACTIVITY_PATH, "utf8");

describe("/activity demotion (PR #140 G11)", () => {
  it("global Activity is not advertised in the main sidebar", () => {
    const titles = mainNav.map((n) => n.title);
    const hrefs = mainNav.map((n) => n.href);
    expect(titles).not.toContain("Activity");
    expect(hrefs).not.toContain("/activity");
  });

  it("non-admin staff are redirected away from global Activity", () => {
    expect(PAGE_SOURCE).toContain('redirect("/clients")');
    expect(PAGE_SOURCE).toMatch(/staff\.role !== "ADMIN"/);
  });

  it("global Activity uses requireOpensDoorsStaff (not requireStaffUser)", () => {
    expect(PAGE_SOURCE).toContain("requireOpensDoorsStaff");
    expect(PAGE_SOURCE).not.toContain("requireStaffUser");
  });

  it("global Activity is labelled as an admin-only legacy view", () => {
    expect(PAGE_SOURCE).toContain("Activity (admin legacy view)");
    expect(PAGE_SOURCE).toMatch(/Admin-only legacy view/);
    expect(PAGE_SOURCE).toMatch(/not in the staff sidebar/);
  });

  it("per-client Activity route remains intact", () => {
    expect(CLIENT_ACTIVITY_SOURCE).toContain("requireOpensDoorsStaff");
    // The PR #137 actionable-replies surface is preserved.
    expect(CLIENT_ACTIVITY_SOURCE).toMatch(/clientId/);
  });

  it("per-client Activity defaults to the outreach-only view (hides random inbox mail)", () => {
    // PR #137 introduced the `mode: "outreach" | "all"` filter on the
    // client activity timeline. The page defaults to "outreach", which
    // hides random mailbox inbox mail. Don't regress that default.
    expect(CLIENT_ACTIVITY_SOURCE).toMatch(/mode\s*=\s*sp\.view\s*===\s*"all"\s*\?\s*"all"\s*:\s*"outreach"/);
    expect(CLIENT_ACTIVITY_SOURCE).toContain("loadClientActivityTimeline");
  });
});
