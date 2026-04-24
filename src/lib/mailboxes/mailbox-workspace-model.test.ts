import { describe, expect, it } from "vitest";

import {
  OUTREACH_HERO_ADDENDUM,
  UNSUBSCRIBE_AFTER_SIGNATURE,
  WORKSPACE_MAILBOXES_HERO,
} from "./mailbox-workspace-model";

describe("mailbox-workspace-model", () => {
  it("states shared-pool semantics in the mailboxes hero", () => {
    expect(WORKSPACE_MAILBOXES_HERO).toContain("authorised operator");
    expect(WORKSPACE_MAILBOXES_HERO).toContain("workspace");
  });

  it("ties outreach to the shared pool", () => {
    expect(OUTREACH_HERO_ADDENDUM).toContain("shared");
    expect(OUTREACH_HERO_ADDENDUM).toContain("Mailboxes");
  });

  it("documents unsubscribe ordering as signature-then-footer", () => {
    expect(UNSUBSCRIBE_AFTER_SIGNATURE).toBe(true);
  });
});
