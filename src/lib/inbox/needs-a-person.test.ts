import { describe, expect, it } from "vitest";

import {
  NOW_OVERDUE_AFTER_MS,
  SOON_OVERDUE_AFTER_MS,
  buildNeedsAPersonQueue,
  needsAPerson,
  triageBandFor,
  type ReplyTriageFact,
} from "./needs-a-person";

/**
 * Tests for the cross-client "who is waiting on a human" queue.
 *
 * These are ROUTING rules, and the expensive mistake is only ever in one
 * direction: a warm reply that never reaches a person. Every test below
 * describes a way this list could silently drop somebody who wrote back
 * saying yes. None of them is a display preference.
 */

const T0 = new Date("2026-08-29T09:00:00.000Z");

function fact(over: Partial<ReplyTriageFact> = {}): ReplyTriageFact {
  return {
    replyId: "reply-1",
    clientId: "client-1",
    clientName: "Acme Ltd",
    fromEmail: "prospect@example.com",
    subject: "Re: quick question",
    receivedAt: new Date(T0.getTime() - 10 * 60_000),
    classification: "POSITIVE",
    classificationRationale: "Asks for a call this week.",
    handledAt: null,
    repliedAt: null,
    contactSuppressed: false,
    ...over,
  };
}

describe("triageBandFor", () => {
  it("puts a person who wants to talk now in the NOW band", () => {
    expect(triageBandFor("POSITIVE")).toBe("NOW");
  });

  it("puts a referral and an unreadable reply in SOON — both need a human, neither is a booking", () => {
    expect(triageBandFor("REFERRAL")).toBe("SOON");
    expect(triageBandFor("UNCLEAR")).toBe("SOON");
  });

  /**
   * The single most important assertion in this file.
   *
   * `InboundReply.classification` is null when the feature is off, the call
   * failed, or the model gave an answer we would not store — which is the
   * state of PRODUCTION today, because ANTHROPIC_API_KEY is unset. If null
   * fell out of this queue, the screen would be empty and would look calm
   * while every reply in the system went unrouted.
   */
  it("treats an unclassified reply as needing a human, never as nothing to see", () => {
    expect(triageBandFor(null)).toBe("SOON");
  });

  it("puts a later-date reply in LATER — a real job, but not today's", () => {
    expect(triageBandFor("INTERESTED_LATER")).toBe("LATER");
  });

  it("keeps rejections and opt-outs out of the queue entirely", () => {
    expect(triageBandFor("NOT_INTERESTED")).toBeNull();
    expect(triageBandFor("UNSUBSCRIBE")).toBeNull();
  });
});

describe("needsAPerson", () => {
  it("wants a person for a fresh positive reply", () => {
    expect(needsAPerson(fact())).toBe(true);
  });

  it("wants a person for an unclassified reply", () => {
    expect(needsAPerson(fact({ classification: null }))).toBe(true);
  });

  it("does not want a person for a clear no", () => {
    expect(needsAPerson(fact({ classification: "NOT_INTERESTED" }))).toBe(false);
  });

  // The three durable "somebody acted" signals. Each one deletes the advisory
  // claim in the existing code, so the claim itself cannot be the test — only
  // these persist.
  it("drops a reply an operator marked handled", () => {
    expect(needsAPerson(fact({ handledAt: T0 }))).toBe(false);
  });

  it("drops a reply we have written back to", () => {
    expect(needsAPerson(fact({ repliedAt: T0 }))).toBe(false);
  });

  it("drops a reply whose contact has been added to do-not-contact", () => {
    expect(needsAPerson(fact({ contactSuppressed: true }))).toBe(false);
  });
});

describe("buildNeedsAPersonQueue", () => {
  it("ranks a booking above a referral, and a referral above a later-date", () => {
    const queue = buildNeedsAPersonQueue({
      now: T0,
      facts: [
        fact({ replyId: "later", classification: "INTERESTED_LATER" }),
        fact({ replyId: "referral", classification: "REFERRAL" }),
        fact({ replyId: "positive", classification: "POSITIVE" }),
      ],
    });

    expect(queue.entries.map((e) => e.replyId)).toEqual([
      "positive",
      "referral",
      "later",
    ]);
  });

  /**
   * Longest-waiting first WITHIN a band, which is the opposite of the
   * per-client Activity panel's newest-first. This is a work queue, not a
   * feed: the oldest unanswered warm lead is the one about to be lost.
   */
  it("puts the longest-waiting first inside a band", () => {
    const queue = buildNeedsAPersonQueue({
      now: T0,
      facts: [
        fact({ replyId: "recent", receivedAt: new Date(T0.getTime() - 60_000) }),
        fact({ replyId: "oldest", receivedAt: new Date(T0.getTime() - 90 * 60_000) }),
        fact({ replyId: "middle", receivedAt: new Date(T0.getTime() - 30 * 60_000) }),
      ],
    });

    expect(queue.entries.map((e) => e.replyId)).toEqual([
      "oldest",
      "middle",
      "recent",
    ]);
  });

  it("excludes handled and rejected replies from the list and the counts", () => {
    const queue = buildNeedsAPersonQueue({
      now: T0,
      facts: [
        fact({ replyId: "keep" }),
        fact({ replyId: "no", classification: "NOT_INTERESTED" }),
        fact({ replyId: "done", handledAt: T0 }),
      ],
    });

    expect(queue.entries.map((e) => e.replyId)).toEqual(["keep"]);
    expect(queue.totalWaiting).toBe(1);
  });

  it("counts the people who want to talk separately — that is the number that matters", () => {
    const queue = buildNeedsAPersonQueue({
      now: T0,
      facts: [
        fact({ replyId: "a", classification: "POSITIVE" }),
        fact({ replyId: "b", classification: "POSITIVE" }),
        fact({ replyId: "c", classification: "REFERRAL" }),
        fact({ replyId: "d", classification: "NOT_INTERESTED" }),
      ],
    });

    expect(queue.wantToTalkCount).toBe(2);
    expect(queue.totalWaiting).toBe(3);
  });

  it("flags a booking left waiting past the NOW threshold as overdue", () => {
    const queue = buildNeedsAPersonQueue({
      now: T0,
      facts: [
        fact({
          replyId: "stale",
          receivedAt: new Date(T0.getTime() - NOW_OVERDUE_AFTER_MS - 60_000),
        }),
        fact({ replyId: "fresh", receivedAt: new Date(T0.getTime() - 60_000) }),
      ],
    });

    const byId = new Map(queue.entries.map((e) => [e.replyId, e]));
    expect(byId.get("stale")?.overdue).toBe(true);
    expect(byId.get("fresh")?.overdue).toBe(false);
    expect(queue.overdueCount).toBe(1);
  });

  it("gives a referral longer than a booking before it counts as overdue", () => {
    const justOverNow = new Date(T0.getTime() - NOW_OVERDUE_AFTER_MS - 60_000);
    const queue = buildNeedsAPersonQueue({
      now: T0,
      facts: [
        fact({ replyId: "referral", classification: "REFERRAL", receivedAt: justOverNow }),
      ],
    });

    expect(SOON_OVERDUE_AFTER_MS).toBeGreaterThan(NOW_OVERDUE_AFTER_MS);
    expect(queue.entries[0]?.overdue).toBe(false);
  });

  it("says how long somebody has been waiting, in words a person reads", () => {
    const queue = buildNeedsAPersonQueue({
      now: T0,
      facts: [
        fact({ replyId: "m", receivedAt: new Date(T0.getTime() - 5 * 60_000) }),
        fact({ replyId: "h", receivedAt: new Date(T0.getTime() - 3 * 3_600_000) }),
        fact({ replyId: "d", receivedAt: new Date(T0.getTime() - 2 * 86_400_000) }),
      ],
    });

    const byId = new Map(queue.entries.map((e) => [e.replyId, e]));
    expect(byId.get("m")?.waitingLabel).toBe("5 minutes");
    expect(byId.get("h")?.waitingLabel).toBe("3 hours");
    expect(byId.get("d")?.waitingLabel).toBe("2 days");
  });

  it("is empty, and says nothing is waiting, when every reply is dealt with", () => {
    const queue = buildNeedsAPersonQueue({
      now: T0,
      facts: [fact({ handledAt: T0 }), fact({ replyId: "x", repliedAt: T0 })],
    });

    expect(queue.entries).toEqual([]);
    expect(queue.totalWaiting).toBe(0);
    expect(queue.overdueCount).toBe(0);
    expect(queue.wantToTalkCount).toBe(0);
  });
});
