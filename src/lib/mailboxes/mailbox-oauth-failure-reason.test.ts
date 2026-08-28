import { describe, expect, it } from "vitest";

import { mailboxOAuthBanner } from "./mailbox-oauth-banner-message";
import {
  MAILBOX_OAUTH_ALIASED_REASON_GROUPS,
  MAILBOX_OAUTH_ALL_REASONS,
  MAILBOX_OAUTH_CALLBACK_FAILED_REASON,
  MAILBOX_OAUTH_THROWN_REASONS,
  isMailboxOAuthFailureReason,
} from "./mailbox-oauth-failure-reason";

/**
 * The vocabulary is only worth having if every word in it says something
 * different to the person reading the banner. These are the guards that stop it
 * decaying back into the shrug it replaced.
 */

function bannerFor(reason: string): string {
  const banner = mailboxOAuthBanner({
    result: "error",
    reason,
    provider: "GOOGLE",
    mailboxEmail: "alex@trainhugger.com",
    approvedEmail: "greg.visser64@gmail.com",
    verifiedConnected: false,
    hasMailboxId: true,
  });
  expect(banner, `no banner for ${reason}`).not.toBeNull();
  return banner!.text;
}

/**
 * What the banner says for a reason it has never heard of. Computed, not
 * transcribed, so rewording the default cannot quietly disarm the test below.
 */
const DEFAULT_SENTENCE = bannerFor("a_reason_no_switch_arm_handles");

describe("mailbox OAuth reason vocabulary", () => {
  /**
   * THE guard. Written first as a uniqueness check, which did not fire: deleting
   * a `case` arm drops that reason onto the default sentence, and the default
   * sentence is unique, so nothing clashed and the test stayed green while the
   * behaviour was gone. Proving a test can fail is not optional here — this one
   * was built, wired, reported success and did nothing, in the same cycle that
   * was written to stop exactly that.
   */
  it("renders no known reason as the unhandled-default sentence", () => {
    for (const reason of MAILBOX_OAUTH_ALL_REASONS) {
      expect(
        bannerFor(reason),
        `"${reason}" has no case of its own and fell through to the default`,
      ).not.toBe(DEFAULT_SENTENCE);
    }
  });

  /**
   * The one that matters. A code added without a sentence would silently fall
   * through to the generic default and the operator would be back where this
   * started — told something broke, with nothing to act on.
   */
  it("gives every reason a sentence of its own", () => {
    /** Which declared alias group a reason is in, if any. */
    const groupOf = (reason: string): number | null => {
      const i = MAILBOX_OAUTH_ALIASED_REASON_GROUPS.findIndex((g) =>
        (g as readonly string[]).includes(reason),
      );
      return i === -1 ? null : i;
    };

    const seen = new Map<string, string>();
    for (const reason of MAILBOX_OAUTH_ALL_REASONS) {
      const text = bannerFor(reason);
      const clash = seen.get(text);
      if (clash === undefined) {
        seen.set(text, reason);
        continue;
      }
      const shared = groupOf(reason);
      expect(
        shared !== null && shared === groupOf(clash),
        `"${reason}" renders the same sentence as "${clash}" — either they are one reason, or one of them has no sentence and fell through to the default. If the sharing is deliberate, declare it in MAILBOX_OAUTH_ALIASED_REASON_GROUPS.`,
      ).toBe(true);
    }
    const aliased = MAILBOX_OAUTH_ALIASED_REASON_GROUPS.reduce(
      (n, g) => n + g.length - 1,
      0,
    );
    expect(seen.size).toBe(MAILBOX_OAUTH_ALL_REASONS.length - aliased);
  });

  /**
   * The alias list is an escape hatch, so it has to stay honest: a group whose
   * members do NOT in fact share a sentence would be quietly excusing a code
   * that has no sentence at all.
   */
  it("keeps every declared alias group genuinely sharing one sentence", () => {
    for (const group of MAILBOX_OAUTH_ALIASED_REASON_GROUPS) {
      const texts = new Set(group.map((r) => bannerFor(r)));
      expect(texts.size, `alias group ${group.join("/")} does not share`).toBe(1);
    }
  });

  /**
   * A reason that does not tell the reader what to do next is decoration.
   * Every sentence has to name either the operator's next move or whose job it
   * is when it is not theirs.
   */
  it("tells the reader what to do next, on every reason", () => {
    for (const reason of MAILBOX_OAUTH_ALL_REASONS) {
      expect(
        bannerFor(reason),
        `"${reason}" does not say what to do next`,
      ).toMatch(/connect|administrator|restore/i);
    }
  });

  it("keeps codes URL-safe and free of anything a provider supplied", () => {
    for (const reason of MAILBOX_OAUTH_ALL_REASONS) {
      expect(reason).toMatch(/^[a-z][a-z_]{2,39}$/);
    }
  });

  it("recognises only the reasons a throw site can raise", () => {
    for (const reason of MAILBOX_OAUTH_THROWN_REASONS) {
      expect(isMailboxOAuthFailureReason(reason)).toBe(true);
    }
    for (const notThrown of ["missing_state", "expired_state", "", null, 7]) {
      expect(isMailboxOAuthFailureReason(notThrown)).toBe(false);
    }
  });

  it("keeps the unclassified floor in the vocabulary", () => {
    expect(MAILBOX_OAUTH_THROWN_REASONS).toContain(
      MAILBOX_OAUTH_CALLBACK_FAILED_REASON,
    );
  });
});
