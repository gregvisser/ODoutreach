import { describe, expect, it } from "vitest";

import {
  replyClassificationBadge,
  UNCLASSIFIED_BADGE,
} from "./reply-classification-display";
import { REPLY_CLASSIFICATIONS } from "./reply-classification";

describe("replyClassificationBadge", () => {
  it("gives every label a badge with visible words", () => {
    // Colour must never be the only signal — the words carry the meaning for
    // anyone who cannot distinguish the tints.
    for (const label of REPLY_CLASSIFICATIONS) {
      const badge = replyClassificationBadge(label);
      expect(badge.text.length).toBeGreaterThan(0);
      expect(badge.className.length).toBeGreaterThan(0);
    }
  });

  it("flags the three labels a person must act on", () => {
    // The point of the whole feature: a warm reply, a referral, and anything
    // the model could not read all need a human. A rejection does not.
    expect(replyClassificationBadge("POSITIVE").needsHuman).toBe(true);
    expect(replyClassificationBadge("REFERRAL").needsHuman).toBe(true);
    expect(replyClassificationBadge("UNCLEAR").needsHuman).toBe(true);
    expect(replyClassificationBadge("NOT_INTERESTED").needsHuman).toBe(false);
  });

  it("does not mute UNCLEAR into looking like a closed rejection", () => {
    // Regression guard for the exact failure UNCLEAR exists to prevent: if an
    // unreadable reply renders in the same quiet grey as NOT_INTERESTED, it is
    // buried — which is what having the label was meant to stop.
    const unclear = replyClassificationBadge("UNCLEAR");
    const rejected = replyClassificationBadge("NOT_INTERESTED");
    expect(unclear.className).not.toBe(rejected.className);
  });

  it("says an unclassified reply has not been checked, rather than showing nothing", () => {
    // A blank cell reads as "nothing of interest here". It is not.
    expect(UNCLASSIFIED_BADGE.text).toMatch(/not checked/i);
    expect(UNCLASSIFIED_BADGE.needsHuman).toBe(true);
  });
});
