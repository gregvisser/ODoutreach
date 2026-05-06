import { describe, expect, it } from "vitest";

import { mainNav } from "@/components/app-shell/nav-config";
import { DAILY_OUTREACH_WORKFLOW_STEPS } from "@/lib/training/modules";

describe("staff handover copy", () => {
  it("uses Do-not-contact in operator navigation", () => {
    expect(mainNav.map((item) => item.title)).toContain("Do-not-contact");
    expect(mainNav.map((item) => item.title)).toContain("Admin operations");
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
});
