import { describe, expect, it } from "vitest";

import {
  MailboxOAuthAccountMismatchError,
  MailboxOAuthFailure,
  mailboxEmailsAlign,
  mailboxOAuthFailureReasonOf,
} from "./mailbox-oauth-callback-shared";

describe("mailboxEmailsAlign", () => {
  it("matches case-insensitively", () => {
    expect(mailboxEmailsAlign("a@b.co", "A@B.CO")).toBe(true);
  });

  it("rejects different mailboxes", () => {
    expect(mailboxEmailsAlign("a@b.co", "x@b.co")).toBe(false);
  });
});

describe("mailboxOAuthFailureReasonOf", () => {
  it("carries the reason the throw site attached", () => {
    expect(
      mailboxOAuthFailureReasonOf(
        new MailboxOAuthFailure("token_exchange_rejected", "invalid_grant"),
      ),
    ).toBe("token_exchange_rejected");
  });

  /**
   * The mismatch error predates this vocabulary and is now a subclass, so the
   * reason it has always redirected with has to survive the change.
   */
  it("keeps the wrong-account reason it has always used", () => {
    const e = new MailboxOAuthAccountMismatchError("greg@x.co", "alex@y.co");
    expect(mailboxOAuthFailureReasonOf(e)).toBe("oauth_account_mismatch");
    expect(e).toBeInstanceOf(MailboxOAuthFailure);
    // The message is what the row's `lastError` stores and the banner repeats;
    // making it a subclass must not have reworded it.
    expect(e.message).toContain("You approved as greg@x.co");
  });

  /**
   * Deliberately NOT guessed from message text. A wrong-but-specific reason
   * sends someone to fix the wrong thing, which is worse than admitting the
   * cause is unrecognised — and prose changes whenever a provider reworks an
   * error string.
   */
  it("reports anything untagged as unclassified rather than guessing", () => {
    expect(
      mailboxOAuthFailureReasonOf(
        new Error("Google token exchange failed: invalid_grant"),
      ),
    ).toBe("callback_failed");
    expect(mailboxOAuthFailureReasonOf("a string")).toBe("callback_failed");
    expect(mailboxOAuthFailureReasonOf(undefined)).toBe("callback_failed");
  });
});
