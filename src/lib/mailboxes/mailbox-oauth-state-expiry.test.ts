import { describe, expect, it } from "vitest";

import {
  MAILBOX_OAUTH_STATE_TTL_MS,
  isMailboxOAuthStateExpired,
  mailboxOAuthStateExpiresAt,
} from "./mailbox-oauth-state-expiry";

const PREPARED_AT = new Date("2026-08-28T12:00:00.000Z");

describe("mailboxOAuthStateExpiresAt", () => {
  it("is fifteen minutes after the state was prepared", () => {
    expect(mailboxOAuthStateExpiresAt(PREPARED_AT)).toEqual(
      new Date("2026-08-28T12:15:00.000Z"),
    );
  });

  it("does not mutate the date it was given", () => {
    mailboxOAuthStateExpiresAt(PREPARED_AT);
    expect(PREPARED_AT.toISOString()).toBe("2026-08-28T12:00:00.000Z");
  });
});

describe("isMailboxOAuthStateExpired", () => {
  const expiresAt = mailboxOAuthStateExpiresAt(PREPARED_AT);

  it("accepts a state presented inside the window", () => {
    expect(
      isMailboxOAuthStateExpired(expiresAt, new Date("2026-08-28T12:14:59.999Z")),
    ).toBe(false);
  });

  it("accepts a state presented on the exact expiry millisecond", () => {
    expect(isMailboxOAuthStateExpired(expiresAt, expiresAt)).toBe(false);
  });

  it("refuses a state one millisecond past the window", () => {
    expect(
      isMailboxOAuthStateExpired(expiresAt, new Date("2026-08-28T12:15:00.001Z")),
    ).toBe(true);
  });

  it("refuses the abandoned Connect this whole module exists for", () => {
    // The case that was live in production: a state prepared, never used, still
    // sitting in the database days later.
    const daysLater = new Date(
      PREPARED_AT.getTime() + 5 * 24 * 60 * 60 * 1000,
    );
    expect(isMailboxOAuthStateExpired(expiresAt, daysLater)).toBe(true);
  });

  it("fails closed on a row with no expiry at all", () => {
    expect(isMailboxOAuthStateExpired(null, PREPARED_AT)).toBe(true);
    expect(isMailboxOAuthStateExpired(undefined, PREPARED_AT)).toBe(true);
  });

  it("agrees with the TTL the prepare step writes", () => {
    // Guards the drift that caused the original defect: a value written in one
    // place and enforced from another.
    const now = new Date("2026-08-28T12:00:00.000Z");
    const justInside = new Date(now.getTime() + MAILBOX_OAUTH_STATE_TTL_MS);
    const justOutside = new Date(justInside.getTime() + 1);
    expect(isMailboxOAuthStateExpired(mailboxOAuthStateExpiresAt(now), justInside)).toBe(
      false,
    );
    expect(
      isMailboxOAuthStateExpired(mailboxOAuthStateExpiresAt(now), justOutside),
    ).toBe(true);
  });
});
