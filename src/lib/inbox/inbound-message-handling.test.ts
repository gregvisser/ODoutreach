import { describe, expect, it } from "vitest";

import {
  appendReplyOutboundId,
  buildReplySubject,
  EMPTY_HANDLING_STATE,
  mergeHandlingIntoMetadata,
  readHandlingStateFromMetadata,
} from "./inbound-message-handling";

describe("readHandlingStateFromMetadata", () => {
  it("returns empty state when metadata is null / undefined / malformed", () => {
    expect(readHandlingStateFromMetadata(null)).toEqual(EMPTY_HANDLING_STATE);
    expect(readHandlingStateFromMetadata(undefined)).toEqual(
      EMPTY_HANDLING_STATE,
    );
    expect(readHandlingStateFromMetadata("handling")).toEqual(
      EMPTY_HANDLING_STATE,
    );
    expect(readHandlingStateFromMetadata([])).toEqual(EMPTY_HANDLING_STATE);
  });

  it("ignores metadata that has no handling sub-object", () => {
    expect(
      readHandlingStateFromMetadata({ internetMessageId: "abc" }),
    ).toEqual(EMPTY_HANDLING_STATE);
  });

  it("reads all handling fields when present", () => {
    const state = readHandlingStateFromMetadata({
      threadId: "t-1",
      handling: {
        handledAt: "2026-04-21T10:00:00.000Z",
        handledByStaffUserId: "staff-1",
        lastRepliedAt: "2026-04-21T10:05:00.000Z",
        replyOutboundEmailIds: ["out-1", "out-2"],
      },
    });
    expect(state.handledAt).toBe("2026-04-21T10:00:00.000Z");
    expect(state.handledByStaffUserId).toBe("staff-1");
    expect(state.lastRepliedAt).toBe("2026-04-21T10:05:00.000Z");
    expect(state.replyOutboundEmailIds).toEqual(["out-1", "out-2"]);
  });

  it("drops non-string entries from replyOutboundEmailIds", () => {
    const state = readHandlingStateFromMetadata({
      handling: {
        replyOutboundEmailIds: ["out-1", 42, null, "", "out-2"],
      },
    });
    expect(state.replyOutboundEmailIds).toEqual(["out-1", "out-2"]);
  });
});

describe("mergeHandlingIntoMetadata", () => {
  it("preserves non-handling metadata keys", () => {
    const merged = mergeHandlingIntoMetadata(
      { internetMessageId: "imsg-1", threadId: "thr-1" },
      { handledAt: "2026-04-21T10:00:00.000Z" },
    );
    expect(merged["internetMessageId"]).toBe("imsg-1");
    expect(merged["threadId"]).toBe("thr-1");
    expect((merged["handling"] as Record<string, unknown>).handledAt).toBe(
      "2026-04-21T10:00:00.000Z",
    );
  });

  it("retains earlier handling fields when patch only updates one field", () => {
    const merged = mergeHandlingIntoMetadata(
      {
        handling: {
          handledAt: "2026-04-21T10:00:00.000Z",
          handledByStaffUserId: "staff-1",
        },
      },
      { lastRepliedAt: "2026-04-21T10:05:00.000Z" },
    );
    const handling = merged["handling"] as Record<string, unknown>;
    expect(handling.handledAt).toBe("2026-04-21T10:00:00.000Z");
    expect(handling.handledByStaffUserId).toBe("staff-1");
    expect(handling.lastRepliedAt).toBe("2026-04-21T10:05:00.000Z");
  });

  it("omits handling entirely when every field is empty", () => {
    const merged = mergeHandlingIntoMetadata(
      { threadId: "thr-1" },
      { handledAt: null, lastRepliedAt: null, replyOutboundEmailIds: [] },
    );
    expect(merged).not.toHaveProperty("handling");
    expect(merged["threadId"]).toBe("thr-1");
  });

  it("does not mutate the input metadata object", () => {
    const original = { internetMessageId: "imsg-1" } as Record<string, unknown>;
    const merged = mergeHandlingIntoMetadata(original, {
      handledAt: "2026-04-21T10:00:00.000Z",
    });
    expect(original).toEqual({ internetMessageId: "imsg-1" });
    expect(merged).not.toBe(original);
  });
});

describe("appendReplyOutboundId", () => {
  it("appends a new id", () => {
    const next = appendReplyOutboundId(EMPTY_HANDLING_STATE, "out-1");
    expect(next.replyOutboundEmailIds).toEqual(["out-1"]);
  });

  it("deduplicates existing ids", () => {
    const state = appendReplyOutboundId(EMPTY_HANDLING_STATE, "out-1");
    const again = appendReplyOutboundId(state, "out-1");
    expect(again.replyOutboundEmailIds).toEqual(["out-1"]);
  });

  it("ignores empty ids", () => {
    const next = appendReplyOutboundId(EMPTY_HANDLING_STATE, "");
    expect(next.replyOutboundEmailIds).toEqual([]);
  });

  it("does not mutate the input state", () => {
    const state = { ...EMPTY_HANDLING_STATE };
    const next = appendReplyOutboundId(state, "out-1");
    expect(state.replyOutboundEmailIds).toEqual([]);
    expect(next).not.toBe(state);
  });
});

describe("buildReplySubject", () => {
  it("prefixes Re: when the subject is non-empty", () => {
    expect(buildReplySubject("Hello")).toBe("Re: Hello");
  });

  it("returns 'Re:' for null / empty / whitespace subjects", () => {
    expect(buildReplySubject(null)).toBe("Re:");
    expect(buildReplySubject("")).toBe("Re:");
    expect(buildReplySubject("   ")).toBe("Re:");
  });

  it("does not stack Re: prefixes", () => {
    expect(buildReplySubject("Re: Hello")).toBe("Re: Hello");
    expect(buildReplySubject("RE:Hello")).toBe("RE:Hello");
    expect(buildReplySubject("re : Hello")).toBe("re : Hello");
  });
});
