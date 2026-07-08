import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { mainNav } from "@/components/app-shell/nav-config";

/**
 * PR #139 — Final nav audit lock-down.
 *
 * Locks in the post-PR-135 (Dashboard / Admin Operations removed) and
 * post-PR-138 (global Contacts removed; Lists / Do-not-contact renamed)
 * shape of the sidebar and per-client subnav.
 *
 * Pure-string assertions: this test does not import client React components.
 */

const SUBNAV_PATH = join(process.cwd(), "src/components/clients/client-workspace-subnav.tsx");
const SUBNAV_SOURCE = readFileSync(SUBNAV_PATH, "utf8");

describe("Main sidebar (PR #139 final audit, updated PR #140)", () => {
  it("contains exactly the post-PR-140 main entries, in the documented order", () => {
    // PR #140 (G11): global Activity is demoted to admin-only and
    // removed from the sidebar. Per-client Activity lives inside each
    // client workspace, where it is the trusted operational view.
    expect(mainNav.map((n) => n.title)).toEqual([
      "Reports",
      "Clients",
      "New client",
      "Universe",
      // Global cross-client item renamed "Do-not-contact" -> "Blocked contacts"
      // to end the label collision with the per-client "Do-not-contact" tab and
      // to match the page H1 "People blocked from outreach". Route unchanged.
      "Blocked contacts",
      "Training",
      "Support",
      "Settings",
    ]);
  });

  it("does NOT advertise Dashboard, Admin Operations, global Contacts, or global Activity", () => {
    const titles = mainNav.map((n) => n.title);
    expect(titles).not.toContain("Dashboard");
    expect(titles).not.toContain("Admin Operations");
    expect(titles).not.toContain("Operations");
    expect(titles).not.toContain("Contacts");
    // PR #140: global Activity is removed from the sidebar — per-client
    // Activity is the trusted view.
    expect(titles).not.toContain("Activity");
    const hrefs = mainNav.map((n) => n.href);
    expect(hrefs).not.toContain("/activity");
    expect(hrefs).not.toContain("/operations/outbound");
    expect(hrefs).not.toContain("/contacts");
  });

  it("every main nav entry has a real href starting with /", () => {
    for (const item of mainNav) {
      expect(item.href.startsWith("/")).toBe(true);
      expect(item.href.length).toBeGreaterThan(1);
    }
  });
});

describe("Client workspace subnav (PR #139 final audit)", () => {
  it("renames the contacts sub-route label to Lists (PR #138)", () => {
    expect(SUBNAV_SOURCE).toContain('label: "Lists"');
    // The href stays at /clients/.../contacts to avoid breaking bookmarks,
    // but the label is "Lists".
    expect(SUBNAV_SOURCE).toContain("`${base}/contacts`");
  });

  it("renames the suppression sub-route label to Do-not-contact (PR #138)", () => {
    expect(SUBNAV_SOURCE).toContain('label: "Do-not-contact"');
  });

  it("does not reintroduce the bare 'Contacts' subnav label", () => {
    expect(SUBNAV_SOURCE).not.toContain('label: "Contacts"');
    // Suppression as a *label* is also gone (PR #138). The route /suppression
    // is still a real URL and is intentionally referenced as `href`.
    expect(SUBNAV_SOURCE).not.toContain('label: "Suppression"');
  });

  it("includes every per-client tab the audit checklist refers to", () => {
    for (const expected of [
      "Overview",
      "Brief",
      "Mailboxes",
      "Sources",
      "Lists",
      "Do-not-contact",
      "Templates",
      "Outreach",
      "Activity",
    ]) {
      expect(SUBNAV_SOURCE).toContain(`label: "${expected}"`);
    }
  });
});
