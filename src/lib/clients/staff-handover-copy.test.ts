import { describe, expect, it } from "vitest";

import { mainNav } from "@/components/app-shell/nav-config";
import { DAILY_OUTREACH_WORKFLOW_STEPS } from "@/lib/training/modules";
import { STAFF_HANDOVER_SECTIONS } from "@/lib/training/staff-handover-guide";

describe("staff handover copy", () => {
  it("uses Do-not-contact in operator navigation", () => {
    expect(mainNav.map((item) => item.title)).toContain("Do-not-contact");
    expect(mainNav.map((item) => item.title)).toContain("Admin operations");
    expect(mainNav.map((item) => item.title)).toContain("Universe");
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
