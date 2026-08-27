import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * REPLY CLAIMING — THE WIRING, LOCKED DOWN.
 *
 * The logic is covered by `src/lib/inbox/reply-claim.test.ts` and proven
 * against a real database by `src/server/inbox/reply-claim.integration.test.ts`.
 * Neither of those catches the failure this repository actually keeps making:
 * a feature that is built, correct in isolation, and never fires because
 * nothing calls it.
 *
 * There are three specific ways this feature could go quiet while every other
 * test stayed green, and each has a test below:
 *
 *   1. THE EFFECT MOVES BELOW THE EARLY RETURN. `<ReplyClaimNotice>` renders
 *      nothing when there is no claim to show — which is the normal case for
 *      the FIRST person to open a reply. If the `useEffect` that writes the
 *      claim sat after `if (!claim) return null`, the first person would never
 *      claim anything, so the second person would never be told, and the
 *      feature would be dead for its entire purpose while looking wired up.
 *      (React hooks rules would also flag this, but the consequence is worth
 *      naming where the next person will read it.)
 *   2. A PAGE STOPS RENDERING IT. Both reply detail routes must mount it.
 *   3. AN ACTION STOPS RELEASING. Replying, suppressing and marking handled
 *      each clear the claim; losing one leaves stale "Sarah is handling this"
 *      on a conversation that is already dealt with.
 *
 * Reading source as a string keeps this test fast and DB-free, matching
 * `activity-ui-policy.test.ts`.
 */

function read(...segments: string[]): string {
  return readFileSync(join(process.cwd(), ...segments), "utf8");
}

const noticeSource = read(
  "src",
  "components",
  "activity",
  "reply-claim-notice.tsx",
);

const messagePageSource = read(
  "src",
  "app",
  "(app)",
  "clients",
  "[clientId]",
  "activity",
  "messages",
  "[messageId]",
  "page.tsx",
);

const replyPageSource = read(
  "src",
  "app",
  "(app)",
  "clients",
  "[clientId]",
  "activity",
  "replies",
  "[replyId]",
  "page.tsx",
);

describe("the claim is written even when nothing is rendered", () => {
  it("runs the effect BEFORE the early return, not after it", () => {
    const effectAt = noticeSource.indexOf("useEffect(");
    const earlyReturnAt = noticeSource.indexOf("if (!claim) return null");

    expect(effectAt).toBeGreaterThan(-1);
    expect(earlyReturnAt).toBeGreaterThan(-1);
    // If this ever flips, the first person to open a reply stops claiming it
    // and the second person is never told. See the header comment.
    expect(effectAt).toBeLessThan(earlyReturnAt);
  });

  it("actually calls the claim action from the effect", () => {
    expect(noticeSource).toMatch(/useEffect\([\s\S]*claimReplyAction\(/);
  });

  it("is advisory — it disables nothing and blocks nothing", () => {
    expect(noticeSource).not.toMatch(/\bdisabled\b/);
    expect(noticeSource).toMatch(/nothing here is locked/i);
  });
});

describe("both routes to a reply mount the notice", () => {
  // Matched with a trailing boundary on purpose. `toContain("<ReplyClaimNotice")`
  // was the first version of this and it happily passed against a renamed
  // `<ReplyClaimNoticeDISABLED>` — found by deliberately breaking the page to
  // check the test could go red, which is the only way that kind of hole shows up.
  const MOUNTED = /<ReplyClaimNotice[\s/>]/;

  it("the inbound message detail page renders it and reads the claim", () => {
    expect(messagePageSource).toMatch(MOUNTED);
    expect(messagePageSource).toContain("loadVisibleReplyClaim");
  });

  it("the linked reply detail page renders it and reads the claim", () => {
    expect(replyPageSource).toMatch(MOUNTED);
    expect(replyPageSource).toContain("loadVisibleReplyClaim");
  });

  it("the linked reply page shares the message's claim subject, so one claim covers both routes", () => {
    expect(replyPageSource).toContain("resolveReplyClaimSubject");
    expect(replyPageSource).toContain("inboundMailboxMessageId: detail.inboundMailboxMessageId");
  });
});

describe("acting on a reply releases the claim", () => {
  const cases: { what: string; file: string[] }[] = [
    {
      what: "sending a reply",
      file: ["src", "server", "inbox", "reply-to-inbound-message.ts"],
    },
    {
      what: "marking it handled",
      file: ["src", "server", "inbox", "mark-inbound-message-handled.ts"],
    },
    {
      what: "suppressing the sender",
      file: ["src", "app", "(app)", "clients", "do-not-contact-actions.ts"],
    },
  ];

  for (const { what, file } of cases) {
    it(`${what} calls releaseReplyClaims`, () => {
      expect(read(...file)).toMatch(/releaseReplyClaims\(/);
    });
  }
});
