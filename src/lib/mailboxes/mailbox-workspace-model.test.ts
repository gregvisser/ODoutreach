import { describe, expect, it } from "vitest";

import {
  MAILBOXES_PAGE_INTRO,
  MAILBOXES_PAGE_SUBTITLE,
  MAILBOXES_WHAT_HAPPENS_BULLETS,
  OUTREACH_HERO_ADDENDUM,
  UNSUBSCRIBE_AFTER_SIGNATURE,
  WORKSPACE_MAILBOXES_HERO,
} from "./mailbox-workspace-model";

/**
 * PR #139 — Mailboxes copy is staff-friendly and uses no dev / internal terms.
 * Supersedes PR #117 (fix/mailboxes-remove-clutter-copy) which made a smaller
 * subset of the same removals.
 */
const FORBIDDEN_DEV_PHRASES = [
  "authorised operator",
  "MFA in the browser",
  "Tokens are stored",
  "shared sending pool",
  "Clients do not need",
  "OAuth",
  "tenant id",
  "service account JSON",
] as const;

describe("mailbox-workspace-model", () => {
  it("uses staff-friendly mailbox hero copy with no dev jargon (PR #139, supersedes PR #117)", () => {
    expect(WORKSPACE_MAILBOXES_HERO).toContain("Connected sending mailboxes");
    expect(WORKSPACE_MAILBOXES_HERO).toContain("workspace");
    for (const phrase of FORBIDDEN_DEV_PHRASES) {
      expect(WORKSPACE_MAILBOXES_HERO).not.toContain(phrase);
    }
  });

  it("ties outreach to the connected mailboxes (no internal pool jargon)", () => {
    expect(OUTREACH_HERO_ADDENDUM).toContain("connected mailboxes");
    expect(OUTREACH_HERO_ADDENDUM).toContain("Mailboxes");
    for (const phrase of FORBIDDEN_DEV_PHRASES) {
      expect(OUTREACH_HERO_ADDENDUM).not.toContain(phrase);
    }
  });

  it("uses a short, plain-English mailboxes page intro (PR #139)", () => {
    expect(MAILBOXES_PAGE_INTRO).toContain("inboxes");
    expect(MAILBOXES_PAGE_INTRO).toContain("ODoutreach");
    expect(MAILBOXES_PAGE_INTRO.length).toBeLessThan(160);
    for (const phrase of FORBIDDEN_DEV_PHRASES) {
      expect(MAILBOXES_PAGE_INTRO).not.toContain(phrase);
    }
  });

  it("titles the Mailboxes page as Connected sending mailboxes", () => {
    expect(MAILBOXES_PAGE_SUBTITLE).toBe("Connected sending mailboxes");
  });

  it('exposes a "What happens when you connect a mailbox?" explainer', () => {
    expect(MAILBOXES_WHAT_HAPPENS_BULLETS.length).toBeGreaterThanOrEqual(3);
    const combined = MAILBOXES_WHAT_HAPPENS_BULLETS.join("\n");
    expect(combined).toContain("No email is sent");
    expect(combined).toContain("read replies");
    for (const phrase of FORBIDDEN_DEV_PHRASES) {
      expect(combined).not.toContain(phrase);
    }
  });

  it("documents unsubscribe ordering as signature-then-footer", () => {
    expect(UNSUBSCRIBE_AFTER_SIGNATURE).toBe(true);
  });
});
