import { describe, expect, it } from "vitest";

import {
  MAILBOX_OAUTH_ACCOUNT_MISMATCH_REASON,
  MAILBOX_OAUTH_EXPIRED_STATE_REASON,
  formatMailboxOAuthAccountMismatch,
  mailboxOAuthBanner,
  readMailboxOAuthSearchParams,
} from "./mailbox-oauth-banner-message";
import { MAILBOX_OAUTH_ALL_REASONS } from "./mailbox-oauth-failure-reason";

/**
 * Every reason code the two callback routes can actually redirect with.
 *
 * Read from the vocabulary itself rather than re-typed, because the hand-kept
 * copy would have gone stale the moment cycle 77 added five codes — and the
 * "never says Microsoft" sweep below is only worth anything if it covers the
 * whole set. The trailing entry is the unhandled case, kept explicitly so the
 * default branch is swept too.
 */
const EMITTED_REASONS: string[] = [
  ...MAILBOX_OAUTH_ALL_REASONS,
  "some_reason_added_later_and_not_handled",
];

describe("mailboxOAuthBanner — provider naming", () => {
  it("never says Microsoft for a Google mailbox, on any reason", () => {
    for (const reason of EMITTED_REASONS) {
      const banner = mailboxOAuthBanner({
        result: "error",
        reason,
        provider: "GOOGLE",
        mailboxEmail: "alex@trainhugger.com",
        approvedEmail: "greg.visser64@gmail.com",
        verifiedConnected: false,
        hasMailboxId: true,
      });
      expect(banner, `reason=${reason} produced no banner`).not.toBeNull();
      expect(banner!.text, `reason=${reason}`).not.toMatch(/microsoft/i);
    }
  });

  it("never says Microsoft for a Google mailbox that returned but did not connect", () => {
    const banner = mailboxOAuthBanner({
      result: "connected",
      reason: undefined,
      provider: "GOOGLE",
      mailboxEmail: "alex@trainhugger.com",
      approvedEmail: null,
      verifiedConnected: false,
      hasMailboxId: true,
    });
    expect(banner).toEqual({ type: "err", text: expect.any(String) });
    expect(banner!.text).not.toMatch(/microsoft/i);
    expect(banner!.text).toMatch(/google/i);
  });

  it("still names Microsoft for a Microsoft mailbox", () => {
    const banner = mailboxOAuthBanner({
      result: "error",
      reason: "provider_denied",
      provider: "MICROSOFT",
      mailboxEmail: "lucy@opensdoors.co.uk",
      approvedEmail: null,
      verifiedConnected: false,
      hasMailboxId: true,
    });
    expect(banner!.text).toMatch(/Microsoft/);
    expect(banner!.text).not.toMatch(/google/i);
  });

  it("names neither provider when the row is unknown (no mailbox id on the redirect)", () => {
    const banner = mailboxOAuthBanner({
      result: "error",
      reason: "unknown_state",
      provider: null,
      mailboxEmail: null,
      approvedEmail: null,
      verifiedConnected: false,
      hasMailboxId: false,
    });
    expect(banner!.text).not.toMatch(/microsoft/i);
    expect(banner!.text).not.toMatch(/google/i);
  });
});

describe("mailboxOAuthBanner — expired sign-in link", () => {
  const base = {
    result: "error" as const,
    provider: "GOOGLE" as const,
    mailboxEmail: "alex@trainhugger.com",
    approvedEmail: null,
    verifiedConnected: false,
    hasMailboxId: true,
  };

  it("tells the operator it timed out and to press Connect again", () => {
    const banner = mailboxOAuthBanner({
      ...base,
      reason: MAILBOX_OAUTH_EXPIRED_STATE_REASON,
    });
    expect(banner!.type).toBe("err");
    expect(banner!.text).toMatch(/timed out/i);
    expect(banner!.text).toMatch(/15 minutes/);
    expect(banner!.text).toMatch(/press Connect/i);
  });

  /**
   * The reason this code exists at all. If the two ever say the same sentence,
   * the split has quietly stopped earning its keep.
   */
  it("does not say the same thing as an unrecognised link", () => {
    const expired = mailboxOAuthBanner({
      ...base,
      reason: MAILBOX_OAUTH_EXPIRED_STATE_REASON,
    });
    const unknown = mailboxOAuthBanner({ ...base, reason: "unknown_state" });
    expect(expired!.text).not.toEqual(unknown!.text);
    // ...and the unrecognised-link message must not itself claim expiry, or the
    // operator is back to one sentence covering two different situations.
    expect(unknown!.text).not.toMatch(/expired|timed out/i);
  });
});

describe("mailboxOAuthBanner — wrong account approved", () => {
  it("names BOTH addresses and tells the operator what to do", () => {
    const banner = mailboxOAuthBanner({
      result: "error",
      reason: MAILBOX_OAUTH_ACCOUNT_MISMATCH_REASON,
      provider: "GOOGLE",
      mailboxEmail: "alex@trainhugger.com",
      approvedEmail: "greg.visser64@gmail.com",
      verifiedConnected: false,
      hasMailboxId: true,
    });
    expect(banner).toEqual({
      type: "err",
      text:
        "You approved as greg.visser64@gmail.com, but this mailbox is alex@trainhugger.com. " +
        "Sign in as alex@trainhugger.com, or ask that person to connect their own mailbox.",
    });
  });

  it("is a different message from a generic callback failure", () => {
    const base = {
      result: "error" as const,
      provider: "GOOGLE" as const,
      mailboxEmail: "alex@trainhugger.com",
      approvedEmail: "greg.visser64@gmail.com",
      verifiedConnected: false,
      hasMailboxId: true,
    };
    const mismatch = mailboxOAuthBanner({
      ...base,
      reason: MAILBOX_OAUTH_ACCOUNT_MISMATCH_REASON,
    });
    const generic = mailboxOAuthBanner({ ...base, reason: "callback_failed" });
    expect(mismatch!.text).not.toEqual(generic!.text);
    expect(generic!.text).not.toContain("greg.visser64@gmail.com");
  });

  it("still names the row address when the approved address is missing", () => {
    const banner = mailboxOAuthBanner({
      result: "error",
      reason: MAILBOX_OAUTH_ACCOUNT_MISMATCH_REASON,
      provider: "GOOGLE",
      mailboxEmail: "alex@trainhugger.com",
      approvedEmail: null,
      verifiedConnected: false,
      hasMailboxId: true,
    });
    expect(banner!.text).toContain("alex@trainhugger.com");
    expect(banner!.text).not.toMatch(/microsoft/i);
  });
});

describe("formatMailboxOAuthAccountMismatch", () => {
  it("is the single wording used for the banner and the stored error", () => {
    expect(
      formatMailboxOAuthAccountMismatch("greg@x.com", "alex@y.com"),
    ).toBe(
      "You approved as greg@x.com, but this mailbox is alex@y.com. " +
        "Sign in as alex@y.com, or ask that person to connect their own mailbox.",
    );
  });
});

describe("readMailboxOAuthSearchParams", () => {
  it("reads a real callback redirect query", () => {
    const url = new URL(
      "https://app.test/clients/c1/mailboxes?mailbox_oauth=error&reason=oauth_account_mismatch&oauth_mailbox_id=mb1&oauth_actor=greg%40x.com",
    );
    const sp = Object.fromEntries(url.searchParams.entries());
    expect(readMailboxOAuthSearchParams(sp)).toEqual({
      result: "error",
      reason: "oauth_account_mismatch",
      mailboxId: "mb1",
      approvedEmail: "greg@x.com",
    });
  });

  it("takes the first value when a param is repeated", () => {
    expect(
      readMailboxOAuthSearchParams({
        mailbox_oauth: ["error", "connected"],
        reason: ["callback_failed"],
      }),
    ).toEqual({
      result: "error",
      reason: "callback_failed",
      mailboxId: null,
      approvedEmail: null,
    });
  });

  it("drops an approved address that is not a plausible email", () => {
    // The address rides on the URL, so it is attacker-suppliable. It is only
    // ever rendered as text, but a hand-typed URL must not be able to put an
    // arbitrary sentence into an error banner.
    expect(
      readMailboxOAuthSearchParams({
        mailbox_oauth: "error",
        reason: "oauth_account_mismatch",
        oauth_actor: "call 0800-not-a-real-support-line",
      }).approvedEmail,
    ).toBeNull();
  });
});
