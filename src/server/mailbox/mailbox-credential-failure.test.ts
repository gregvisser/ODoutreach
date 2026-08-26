import { describe, expect, it } from "vitest";

import {
  classifyMailboxCredentialFailure,
  mailboxCredentialFailureMessage,
} from "./mailbox-credential-failure";

/** The exact string Entra returned for the two Chevron Security mailboxes. */
const DELETED_ACCOUNT_ERROR =
  "Microsoft token refresh failed: invalid_grant - AADSTS500341: The user account jo@chevronsecurity.co.uk has been deleted from the ODoutreach directory.";

/** The exact shape Google returns for the six expired Train Hugger mailboxes. */
const EXPIRED_GOOGLE_ERROR = "Google token refresh failed: invalid_grant";

/**
 * The two error strings PRODUCTION actually emitted, copied verbatim out of
 * Actions run 32947374171 (2026-08-26 08:22 UTC, `processed: 35, failed: 8`).
 *
 * Copied rather than paraphrased on purpose. A classifier tested only against
 * a tidied-up version of an error is a classifier tested against the author's
 * assumption — note the em dash, the `{EUII Hidden}` redaction and the trailing
 * trace ids, none of which anyone would have invented.
 */
const PRODUCTION_ERRORS = {
  google:
    "Google token refresh failed: invalid_grant — Bad Request",
  microsoftDeleted:
    "Microsoft token refresh failed: invalid_grant — AADSTS500341: The user account {EUII Hidden} has been deleted from the 0f89f502-22dd-4366-8a1b-a1a0d7bf8487 directory. To sign into this application, the account must be added to the directory. Trace ID: 04af54ce-f143-47e3-9406-bbe3a5d19a01 Correlation ID: 54c585a7-401d-4aaf-a875-f5fe22d24b35 Timestamp: 2026-08-26 08:22:04Z",
} as const;

describe("the eight mailboxes that were actually failing in production", () => {
  it("takes the six expired Google mailboxes out of CONNECTED, reversibly", () => {
    const failure = classifyMailboxCredentialFailure("GOOGLE", PRODUCTION_ERRORS.google);
    expect(failure.kind).toBe("reauth_required");
    expect(failure.isPermanent).toBe(false);
    expect(failure.connectionStatus).toBe("CONNECTION_ERROR");
  });

  it("takes the two deleted Chevron accounts out permanently", () => {
    const failure = classifyMailboxCredentialFailure(
      "MICROSOFT",
      PRODUCTION_ERRORS.microsoftDeleted,
    );
    expect(failure.kind).toBe("account_deleted");
    expect(failure.isPermanent).toBe(true);
    expect(failure.connectionStatus).toBe("DISCONNECTED");
  });

  it("gives Chevron a sentence that does not ask anyone to reconnect", () => {
    const failure = classifyMailboxCredentialFailure(
      "MICROSOFT",
      PRODUCTION_ERRORS.microsoftDeleted,
    );
    const msg = mailboxCredentialFailureMessage(
      "MICROSOFT",
      failure,
      PRODUCTION_ERRORS.microsoftDeleted,
    );
    expect(msg).toContain("cannot be reconnected");
    expect(msg).not.toMatch(/complete MFA/i);
  });

  it("leaves every one of the twenty-seven healthy mailboxes alone", () => {
    // The twenty-seven that succeeded produced no error at all. Nothing in this
    // change may touch them.
    expect(classifyMailboxCredentialFailure("GOOGLE", null).connectionStatus).toBeNull();
    expect(classifyMailboxCredentialFailure("MICROSOFT", "").connectionStatus).toBeNull();
  });
});

describe("classifyMailboxCredentialFailure", () => {
  it("calls a deleted Microsoft account permanent, even though it arrives as invalid_grant", () => {
    // The whole point. Entra wraps AADSTS500341 in an invalid_grant response,
    // so a classifier that checks invalid_grant first tells a deleted account
    // to reconnect — a job nobody can do.
    const result = classifyMailboxCredentialFailure("MICROSOFT", DELETED_ACCOUNT_ERROR);
    expect(result.kind).toBe("account_deleted");
    expect(result.isPermanent).toBe(true);
    expect(result.connectionStatus).toBe("DISCONNECTED");
  });

  it("calls an expired Google sign-in temporary and fixable", () => {
    const result = classifyMailboxCredentialFailure("GOOGLE", EXPIRED_GOOGLE_ERROR);
    expect(result.kind).toBe("reauth_required");
    expect(result.isPermanent).toBe(false);
    expect(result.connectionStatus).toBe("CONNECTION_ERROR");
  });

  it("calls an expired Microsoft sign-in temporary and fixable", () => {
    const result = classifyMailboxCredentialFailure(
      "MICROSOFT",
      "Microsoft token refresh failed: invalid_grant",
    );
    expect(result.kind).toBe("reauth_required");
    expect(result.connectionStatus).toBe("CONNECTION_ERROR");
  });

  it("treats a missing stored credential as needing a reconnect, not as healthy", () => {
    for (const provider of ["MICROSOFT", "GOOGLE"] as const) {
      const result = classifyMailboxCredentialFailure(
        provider,
        "Mailbox has no stored OAuth credentials. Connect the mailbox first.",
      );
      expect(result.kind).toBe("reauth_required");
      expect(result.connectionStatus).toBe("CONNECTION_ERROR");
    }
  });

  it("leaves the status alone for failures that say nothing about credentials", () => {
    // A Graph 500 or a network blip must NOT knock a healthy mailbox out of the
    // sending pool — that would turn a transient outage into a manual repair
    // job across every mailbox at once.
    for (const transient of [
      "Graph fetch failed: HTTP 503 Service Unavailable",
      "Gmail fetch failed: HTTP 500",
      "fetch failed: ETIMEDOUT",
      "",
      null,
      undefined,
    ]) {
      const result = classifyMailboxCredentialFailure("MICROSOFT", transient);
      expect(result.kind).toBe("not_credential");
      expect(result.isPermanent).toBe(false);
      expect(result.connectionStatus).toBeNull();
    }
  });

  it("does not treat a Microsoft MFA prompt as permanent", () => {
    const result = classifyMailboxCredentialFailure(
      "MICROSOFT",
      "AADSTS50076: due to a configuration change, you must use multi-factor authentication",
    );
    expect(result.isPermanent).toBe(false);
    expect(result.connectionStatus).toBe("CONNECTION_ERROR");
  });
});

describe("mailboxCredentialFailureMessage", () => {
  it("tells a deleted account NOT to reconnect", () => {
    const failure = classifyMailboxCredentialFailure("MICROSOFT", DELETED_ACCOUNT_ERROR);
    const msg = mailboxCredentialFailureMessage("MICROSOFT", failure, DELETED_ACCOUNT_ERROR);
    expect(msg).toContain("cannot be reconnected");
    expect(msg).toContain("no longer exists");
    // It must not open with the reconnect instruction the old code gave.
    expect(msg).not.toMatch(/^Microsoft requires this mailbox to re-authenticate/);
  });

  it("tells an expired sign-in exactly what to do, per provider", () => {
    const google = classifyMailboxCredentialFailure("GOOGLE", EXPIRED_GOOGLE_ERROR);
    expect(mailboxCredentialFailureMessage("GOOGLE", google, EXPIRED_GOOGLE_ERROR)).toContain(
      "Reconnect this mailbox and approve access",
    );

    const microsoft = classifyMailboxCredentialFailure("MICROSOFT", "invalid_grant");
    expect(mailboxCredentialFailureMessage("MICROSOFT", microsoft, "invalid_grant")).toContain(
      "complete MFA",
    );
  });

  it("keeps the provider's own words as evidence, after the instruction", () => {
    const failure = classifyMailboxCredentialFailure("GOOGLE", EXPIRED_GOOGLE_ERROR);
    expect(mailboxCredentialFailureMessage("GOOGLE", failure, EXPIRED_GOOGLE_ERROR)).toContain(
      "invalid_grant",
    );
  });
});
