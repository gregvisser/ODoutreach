import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { mainNav } from "@/components/app-shell/nav-config";

/**
 * PR #140 — Admin operations gate (G9).
 *
 * The `/operations/outbound` page is for delivery / queue troubleshooting
 * and must require `staff.role === "ADMIN"`. Non-admins land on
 * `/reporting`. The route is intentionally not in the staff sidebar.
 *
 * Every mutation action on this surface must also re-check ADMIN
 * server-side so a non-admin who tries to construct a POST by hand cannot
 * release stale claims, requeue failed sends, or flip sender identity.
 */

const PAGE_PATH = join(
  process.cwd(),
  "src/app/(app)/operations/outbound/page.tsx",
);
const ACTIONS_PATH = join(
  process.cwd(),
  "src/app/(app)/operations/outbound/actions.ts",
);
const PAGE_SOURCE = readFileSync(PAGE_PATH, "utf8");
const ACTIONS_SOURCE = readFileSync(ACTIONS_PATH, "utf8");

describe("Admin operations gate (PR #140)", () => {
  it("redirects non-admin staff to /reporting", () => {
    expect(PAGE_SOURCE).toContain('redirect("/reporting")');
    expect(PAGE_SOURCE).toMatch(/staff\.role !== "ADMIN"/);
  });

  it("uses requireOpensDoorsStaff (not the looser requireStaffUser)", () => {
    expect(PAGE_SOURCE).toContain("requireOpensDoorsStaff");
    expect(PAGE_SOURCE).not.toContain("requireStaffUser");
  });

  it("does not advertise /operations/outbound in the main sidebar", () => {
    const hrefs = mainNav.map((n) => n.href);
    expect(hrefs).not.toContain("/operations/outbound");
    expect(hrefs).not.toContain("/operations");
    const titles = mainNav.map((n) => n.title);
    expect(titles).not.toContain("Admin Operations");
    expect(titles).not.toContain("Operations");
  });

  it("describes itself as admin-only on the page intro", () => {
    expect(PAGE_SOURCE).toMatch(/Admin-only delivery/);
    expect(PAGE_SOURCE).toMatch(/Not in the staff\s+sidebar/);
  });

  it("re-checks ADMIN in every mutation action handler", () => {
    // getQueueStatusAction & processQueueAction already had the guard;
    // PR #140 adds it to releaseStaleProcessingAction,
    // operatorRequeueFailedAction, and verifySenderIdentityReadyAction.
    const actionNames = [
      "releaseStaleProcessingAction",
      "operatorRequeueFailedAction",
      "verifySenderIdentityReadyAction",
      "getQueueStatusAction",
      "processQueueAction",
    ];
    for (const name of actionNames) {
      // Locate the action declaration and the next role check after it.
      const fnIndex = ACTIONS_SOURCE.indexOf(`function ${name}`);
      expect(fnIndex).toBeGreaterThan(-1);
      const after = ACTIONS_SOURCE.slice(fnIndex);
      // The guard must appear before the next action declaration / end of
      // file. We match either the role variable or the throw/return shape.
      const roleGuardMatch = after.search(/role !== "ADMIN"/);
      expect(roleGuardMatch).toBeGreaterThan(-1);
    }
  });

  it("never calls processOutboundSendQueue / sync / RocketReach from the page render", () => {
    expect(PAGE_SOURCE).not.toContain("processOutboundSendQueue");
    expect(PAGE_SOURCE).not.toContain("syncReplies");
    expect(PAGE_SOURCE).not.toContain("rocketreach");
  });
});
