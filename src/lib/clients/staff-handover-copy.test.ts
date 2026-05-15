import { describe, expect, it } from "vitest";

import { mainNav } from "@/components/app-shell/nav-config";
import { DAILY_OUTREACH_WORKFLOW_STEPS } from "@/lib/training/modules";
import { STAFF_HANDOVER_SECTIONS } from "@/lib/training/staff-handover-guide";

describe("staff handover copy", () => {
  // PR #135 (system handover audit): Dashboard duplicated Reports, and
  // Admin operations is a delivery diagnostic surface that should not be
  // advertised in normal staff navigation. Both are removed from the
  // sidebar; their routes are preserved (Dashboard redirects to Reports).
  // Reports is the primary staff destination.
  // See docs/ops/SYSTEM_HANDOVER_READINESS_AUDIT.md.
  it("uses Do-not-contact and Universe in operator navigation", () => {
    const titles = mainNav.map((item) => item.title);
    expect(titles).toContain("Do-not-contact");
    expect(titles).toContain("Universe");
    expect(titles).toContain("Reports");
  });

  it("does not advertise legacy Dashboard, Admin operations, or global Activity in the sidebar", () => {
    const titles = mainNav.map((item) => item.title);
    expect(titles).not.toContain("Dashboard");
    expect(titles).not.toContain("Admin operations");
    // PR #140 (G11): global /activity is demoted to admin-only and the
    // sidebar Activity entry is removed. Per-client Activity remains
    // inside each client workspace.
    expect(titles).not.toContain("Activity");
    const hrefs = mainNav.map((item) => item.href);
    expect(hrefs).not.toContain("/dashboard");
    expect(hrefs).not.toContain("/operations/outbound");
    expect(hrefs).not.toContain("/activity");
  });

  // PR #138 (G10 in SYSTEM_HANDOVER_GAPS.md): global Contacts duplicates
  // Universe for the directory case and Sources for the import case. The
  // sidebar entry is removed; the /contacts route itself is kept alive
  // (it still hosts the cross-client CSV form + per-row send sheet) and
  // shows a banner pointing back to Universe / Sources. Test locks both
  // halves of that decision so regressions are obvious.
  it("does not advertise global Contacts in the sidebar (PR #138)", () => {
    const titles = mainNav.map((item) => item.title);
    expect(titles).not.toContain("Contacts");
    const hrefs = mainNav.map((item) => item.href);
    expect(hrefs).not.toContain("/contacts");
  });

  it("makes Reports the first staff destination", () => {
    expect(mainNav[0]?.href).toBe("/reporting");
    expect(mainNav[0]?.title).toBe("Reports");
  });

  it("documents the daily outreach workflow", () => {
    expect(DAILY_OUTREACH_WORKFLOW_STEPS).toEqual([
      "Check Mailboxes",
      "Import contacts",
      "Check Do-not-contact",
      "Build a simple intro sequence",
      "Choose mailbox",
      "Preview",
      "Send or schedule",
      "Check Activity replies",
    ]);
  });

  it("includes printable staff handover guide sections", () => {
    expect(STAFF_HANDOVER_SECTIONS.map((s) => s.title)).toEqual(
      expect.arrayContaining([
        "What ODoutreach does",
        "Daily workflow checklist",
        "Replies and Activity",
        "Safety rules",
        "10-minute handover script",
      ]),
    );
  });
});
