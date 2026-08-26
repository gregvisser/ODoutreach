import { describe, expect, it } from "vitest";

import {
  describeActionFailure,
  resolveActionOutcome,
} from "./panel-action-outcome";

/**
 * A server action that never answers must SAY so on screen.
 *
 * Measured on the live site 2026-08-26: production sheds concurrent requests
 * with 503, and the "Find related domains now" POST was shed with the rest
 * (`POST /clients/cmob909.../suppression -> 503`). The button was correctly
 * wired — the POST proves it fired — but the panel only handled the case where
 * the action RESOLVES with `{ ok: false }`. A shed request does not resolve; it
 * REJECTS. With no catch, the operator saw nothing at all: no error, no
 * spinner, no "that failed". A control that looks wired and silently does
 * nothing is worse than one that was never wired.
 *
 * These tests are about the rejection path specifically, because that is the
 * path that had no code behind it.
 */

describe("describeActionFailure", () => {
  it("tells the operator to retry when the request never reached the server", () => {
    // What a shed request actually looks like in the browser.
    const message = describeActionFailure(new TypeError("Failed to fetch"));

    expect(message).toMatch(/try again/i);
    // It must not claim the work did or did not happen — we cannot know.
    expect(message).toMatch(/could not tell|cannot tell/i);
  });

  it("recognises the server's own overload response", () => {
    const message = describeActionFailure(
      new Error("An unexpected response was received from the server."),
    );

    expect(message).toMatch(/busy|did not answer/i);
    expect(message).toMatch(/try again/i);
  });

  it("still produces a retryable message for an error it does not recognise", () => {
    const message = describeActionFailure(new Error("kaboom"));

    expect(message).toMatch(/try again/i);
    expect(message).toContain("kaboom");
  });

  it("copes with a thrown non-Error", () => {
    const message = describeActionFailure("just a string");

    expect(message).toMatch(/try again/i);
    expect(message.length).toBeGreaterThan(0);
  });

  it("never returns an empty message", () => {
    for (const cause of [undefined, null, {}, new Error("")]) {
      expect(describeActionFailure(cause).trim().length).toBeGreaterThan(0);
    }
  });
});

describe("resolveActionOutcome", () => {
  it("reports an error when the action REJECTS — the shed-503 case", async () => {
    const outcome = await resolveActionOutcome(
      () => Promise.reject(new TypeError("Failed to fetch")),
      () => "should never be used",
    );

    expect(outcome.isError).toBe(true);
    expect(outcome.message).toMatch(/try again/i);
    expect(outcome.retryable).toBe(true);
  });

  it("reports an error when the action resolves with ok:false", async () => {
    const outcome = await resolveActionOutcome(
      () => Promise.resolve({ ok: false as const, error: "You cannot do that." }),
      () => "should never be used",
    );

    expect(outcome.isError).toBe(true);
    expect(outcome.message).toBe("You cannot do that.");
    expect(outcome.retryable).toBe(true);
  });

  it("uses the caller's wording on success and is not retryable", async () => {
    const outcome = await resolveActionOutcome(
      () => Promise.resolve({ ok: true as const, created: 2 }),
      (r) => `Found ${String(r.created)}.`,
    );

    expect(outcome.isError).toBe(false);
    expect(outcome.message).toBe("Found 2.");
    expect(outcome.retryable).toBe(false);
  });

  it("does not let a throwing success formatter swallow the outcome", async () => {
    const outcome = await resolveActionOutcome(
      () => Promise.resolve({ ok: true as const }),
      () => {
        throw new Error("formatter blew up");
      },
    );

    expect(outcome.isError).toBe(true);
    expect(outcome.message).toMatch(/try again/i);
  });

  it("catches a synchronous throw from the action itself", async () => {
    const outcome = await resolveActionOutcome(
      () => {
        throw new Error("threw before awaiting");
      },
      () => "should never be used",
    );

    expect(outcome.isError).toBe(true);
    expect(outcome.message).toContain("threw before awaiting");
  });
});
