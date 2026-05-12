import { describe, expect, it } from "vitest";

import {
  MAILBOXES_PAGE_INTRO,
  OUTREACH_HERO_ADDENDUM,
  UNSUBSCRIBE_AFTER_SIGNATURE,
  WORKSPACE_MAILBOXES_HERO,
} from "./mailbox-workspace-model";

describe("mailbox-workspace-model", () => {
  it("states shared-pool semantics in the mailboxes hero", () => {
    expect(WORKSPACE_MAILBOXES_HERO).toContain("Staff on this workspace");
    expect(WORKSPACE_MAILBOXES_HERO).toContain("workspace");
  });

  it("ties outreach to the shared pool", () => {
    expect(OUTREACH_HERO_ADDENDUM).toContain("shared");
    expect(OUTREACH_HERO_ADDENDUM).toContain("Mailboxes");
  });

  it("uses a short mailboxes page intro for operators", () => {
    expect(MAILBOXES_PAGE_INTRO).toContain("Connect");
    expect(MAILBOXES_PAGE_INTRO).toContain("outreach");
    expect(MAILBOXES_PAGE_INTRO.length).toBeLessThan(120);
  });

  it("documents unsubscribe ordering as signature-then-footer", () => {
    expect(UNSUBSCRIBE_AFTER_SIGNATURE).toBe(true);
  });
});
