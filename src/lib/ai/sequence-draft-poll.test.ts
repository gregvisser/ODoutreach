import { describe, expect, it } from "vitest";

import {
  SEQUENCE_DRAFT_POLL_GIVE_UP_MS,
  SEQUENCE_DRAFT_POLL_INTERVAL_MS,
  nextSequenceDraftPoll,
} from "./sequence-draft-poll";

describe("nextSequenceDraftPoll", () => {
  it("waits while the run is still open", () => {
    expect(
      nextSequenceDraftPoll({
        elapsedMs: 4_000,
        consecutiveFailures: 2,
        response: { ok: true, status: "RUNNING" },
      }),
    ).toEqual({
      action: "wait",
      delayMs: SEQUENCE_DRAFT_POLL_INTERVAL_MS,
      consecutiveFailures: 0,
    });
  });

  it("shows a late success instead of giving up", () => {
    expect(
      nextSequenceDraftPoll({
        elapsedMs: SEQUENCE_DRAFT_POLL_GIVE_UP_MS + 1,
        consecutiveFailures: 0,
        response: { ok: true, status: "SUCCEEDED" },
      }),
    ).toEqual({ action: "done", status: "SUCCEEDED" });
  });

  it("stops after repeated status failures without implying another draft", () => {
    expect(
      nextSequenceDraftPoll({
        elapsedMs: 1_000,
        consecutiveFailures: 4,
        response: { ok: false },
      }),
    ).toEqual({ action: "give-up" });
  });

  it("gives up when the page has been waiting past the poll budget", () => {
    expect(
      nextSequenceDraftPoll({
        elapsedMs: SEQUENCE_DRAFT_POLL_GIVE_UP_MS + 1,
        consecutiveFailures: 0,
        response: { ok: true, status: "QUEUED" },
      }),
    ).toEqual({ action: "give-up" });
  });
});
