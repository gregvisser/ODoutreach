import { describe, expect, it } from "vitest";

import {
  REPLY_CLAIM_STALE_AFTER_MS,
  formatClaimAge,
  resolveReplyClaimSubject,
  selectVisibleClaim,
  type ReplyClaimRow,
} from "./reply-claim";

const NOW = new Date("2026-08-26T12:00:00.000Z");

function minutesAgo(n: number): Date {
  return new Date(NOW.getTime() - n * 60_000);
}

function claim(over: Partial<ReplyClaimRow> = {}): ReplyClaimRow {
  return {
    staffUserId: "staff-sarah",
    displayName: "Sarah Okafor",
    email: "sarah@opensdoors.co.uk",
    claimedAt: minutesAgo(2),
    ...over,
  };
}

describe("REPLY_CLAIM_STALE_AFTER_MS", () => {
  it("is 30 minutes — the window Greg specified", () => {
    expect(REPLY_CLAIM_STALE_AFTER_MS).toBe(30 * 60_000);
  });
});

describe("selectVisibleClaim", () => {
  it("shows the second person that Sarah opened it 2 minutes ago", () => {
    const visible = selectVisibleClaim({
      claims: [claim()],
      viewerStaffUserId: "staff-bob",
      now: NOW,
    });

    expect(visible).not.toBeNull();
    expect(visible?.name).toBe("Sarah Okafor");
    expect(visible?.agoLabel).toBe("2 minutes ago");
  });

  it("never tells you about your own claim", () => {
    const visible = selectVisibleClaim({
      claims: [claim({ staffUserId: "staff-bob" })],
      viewerStaffUserId: "staff-bob",
      now: NOW,
    });

    expect(visible).toBeNull();
  });

  it("hides a claim older than 30 minutes", () => {
    const visible = selectVisibleClaim({
      claims: [claim({ claimedAt: minutesAgo(31) })],
      viewerStaffUserId: "staff-bob",
      now: NOW,
    });

    expect(visible).toBeNull();
  });

  it("still shows a claim at 29 minutes — the boundary is not off by one", () => {
    const visible = selectVisibleClaim({
      claims: [claim({ claimedAt: minutesAgo(29) })],
      viewerStaffUserId: "staff-bob",
      now: NOW,
    });

    expect(visible?.agoLabel).toBe("29 minutes ago");
  });

  it("picks the most recent of several other people's claims", () => {
    const visible = selectVisibleClaim({
      claims: [
        claim({ staffUserId: "a", displayName: "Older", claimedAt: minutesAgo(20) }),
        claim({ staffUserId: "b", displayName: "Newer", claimedAt: minutesAgo(3) }),
        claim({ staffUserId: "c", displayName: "Middle", claimedAt: minutesAgo(9) }),
      ],
      viewerStaffUserId: "staff-bob",
      now: NOW,
    });

    expect(visible?.name).toBe("Newer");
    expect(visible?.othersCount).toBe(2);
  });

  it("excludes the viewer before picking the most recent", () => {
    const visible = selectVisibleClaim({
      claims: [
        claim({ staffUserId: "staff-bob", displayName: "Me", claimedAt: minutesAgo(1) }),
        claim({ staffUserId: "a", displayName: "Sarah", claimedAt: minutesAgo(10) }),
      ],
      viewerStaffUserId: "staff-bob",
      now: NOW,
    });

    expect(visible?.name).toBe("Sarah");
    expect(visible?.othersCount).toBe(0);
  });

  it("falls back to the email address when a staff user has no display name", () => {
    const visible = selectVisibleClaim({
      claims: [claim({ displayName: null })],
      viewerStaffUserId: "staff-bob",
      now: NOW,
    });

    expect(visible?.name).toBe("sarah@opensdoors.co.uk");
  });

  it("returns null when there are no claims at all", () => {
    expect(
      selectVisibleClaim({ claims: [], viewerStaffUserId: "staff-bob", now: NOW }),
    ).toBeNull();
  });
});

describe("formatClaimAge", () => {
  it("reads 'just now' under a minute", () => {
    expect(formatClaimAge(minutesAgo(0), NOW)).toBe("just now");
    expect(formatClaimAge(new Date(NOW.getTime() - 59_000), NOW)).toBe("just now");
  });

  it("singularises one minute", () => {
    expect(formatClaimAge(minutesAgo(1), NOW)).toBe("1 minute ago");
  });

  it("counts whole minutes", () => {
    expect(formatClaimAge(minutesAgo(2), NOW)).toBe("2 minutes ago");
    expect(formatClaimAge(minutesAgo(29), NOW)).toBe("29 minutes ago");
  });

  it("never reads negative when a clock skews forward", () => {
    expect(formatClaimAge(new Date(NOW.getTime() + 5_000), NOW)).toBe("just now");
  });
});

describe("resolveReplyClaimSubject", () => {
  it("keys on the inbound mailbox message so both routes share one claim", () => {
    expect(
      resolveReplyClaimSubject({
        replyId: "reply-1",
        inboundMailboxMessageId: "msg-1",
      }),
    ).toEqual({ subjectType: "INBOUND_MESSAGE", subjectId: "msg-1" });
  });

  it("falls back to the reply id when no mailbox message is correlated", () => {
    expect(
      resolveReplyClaimSubject({
        replyId: "reply-1",
        inboundMailboxMessageId: null,
      }),
    ).toEqual({ subjectType: "INBOUND_REPLY", subjectId: "reply-1" });
  });

  it("treats an empty correlation id as absent", () => {
    expect(
      resolveReplyClaimSubject({
        replyId: "reply-1",
        inboundMailboxMessageId: "",
      }),
    ).toEqual({ subjectType: "INBOUND_REPLY", subjectId: "reply-1" });
  });
});
