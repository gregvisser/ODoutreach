import { describe, expect, it } from "vitest";

import {
  replyOwnershipLabel,
  resolveReplyOwnershipState,
} from "./reply-ownership";
import type { DisplayReplyClaim } from "./reply-claim";

const NOW = new Date("2026-08-31T10:00:00.000Z");

function displayClaim(over: Partial<DisplayReplyClaim> = {}): DisplayReplyClaim {
  return {
    staffUserId: "staff-sarah",
    name: "Sarah Okafor",
    isViewer: false,
    claimedAt: new Date(NOW.getTime() - 2 * 60_000),
    agoLabel: "2 minutes ago",
    othersCount: 0,
    ...over,
  };
}

describe("resolveReplyOwnershipState", () => {
  it("row 132 — an untouched reply is unclaimed, never defaulted to somebody", () => {
    const state = resolveReplyOwnershipState({
      handledAt: null,
      handledByName: null,
      handledByIsViewer: false,
      claim: null,
    });

    expect(state).toEqual({ kind: "unclaimed" });
  });

  it("a live claim, with nothing handled yet, reads as claimed", () => {
    const state = resolveReplyOwnershipState({
      handledAt: null,
      handledByName: null,
      handledByIsViewer: false,
      claim: displayClaim(),
    });

    expect(state.kind).toBe("claimed");
    if (state.kind === "claimed") {
      expect(state.name).toBe("Sarah Okafor");
      expect(state.isViewer).toBe(false);
      expect(state.agoLabel).toBe("2 minutes ago");
    }
  });

  it("handled always wins over a still-live claim — the conversation is dealt with", () => {
    const handledAt = new Date(NOW.getTime() - 3_600_000);
    const state = resolveReplyOwnershipState({
      handledAt,
      handledByName: "Bob Ellis",
      handledByIsViewer: false,
      claim: displayClaim(),
    });

    expect(state).toEqual({
      kind: "handled",
      handledAt,
      byName: "Bob Ellis",
      isViewer: false,
    });
  });

  it("handled by the viewer is distinguished from handled by somebody else", () => {
    const handledAt = new Date(NOW.getTime() - 60_000);
    const state = resolveReplyOwnershipState({
      handledAt,
      handledByName: null,
      handledByIsViewer: true,
      claim: null,
    });

    expect(state.kind).toBe("handled");
    if (state.kind === "handled") expect(state.isViewer).toBe(true);
  });
});

describe("replyOwnershipLabel — plain English, no jargon", () => {
  it("unclaimed", () => {
    expect(replyOwnershipLabel({ kind: "unclaimed" })).toEqual({
      text: "Unclaimed",
      tone: "muted",
    });
  });

  it("claimed by somebody else names them and how long ago", () => {
    expect(
      replyOwnershipLabel({
        kind: "claimed",
        name: "Sarah Okafor",
        isViewer: false,
        agoLabel: "2 minutes ago",
      }),
    ).toEqual({
      text: "Sarah Okafor has this — opened 2 minutes ago",
      tone: "warn",
    });
  });

  it("claimed by the viewer reads as 'You'", () => {
    expect(
      replyOwnershipLabel({
        kind: "claimed",
        name: "You",
        isViewer: true,
        agoLabel: "just now",
      }),
    ).toEqual({
      text: "You have this — opened just now",
      tone: "warn",
    });
  });

  it("handled by somebody else names them", () => {
    expect(
      replyOwnershipLabel({
        kind: "handled",
        handledAt: NOW,
        byName: "Sarah Okafor",
        isViewer: false,
      }),
    ).toEqual({
      text: "Handled by Sarah Okafor",
      tone: "ok",
    });
  });

  it("handled by the viewer reads as 'Handled by you'", () => {
    expect(
      replyOwnershipLabel({
        kind: "handled",
        handledAt: NOW,
        byName: null,
        isViewer: true,
      }),
    ).toEqual({
      text: "Handled by you",
      tone: "ok",
    });
  });

  it("handled with no known name still says something plain, never blank", () => {
    expect(
      replyOwnershipLabel({
        kind: "handled",
        handledAt: NOW,
        byName: null,
        isViewer: false,
      }),
    ).toEqual({
      text: "Handled",
      tone: "ok",
    });
  });
});
