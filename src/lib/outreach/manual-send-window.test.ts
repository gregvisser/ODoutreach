import { describe, expect, it } from "vitest";

import {
  MANUAL_SEND_COOLDOWN_MINUTES,
  MANUAL_SEND_GROUP_SIZE,
  decideManualSendWindow,
  type ManualSendRecord,
} from "./manual-send-window";

/** A queue of `n` distinguishable recipients, so slicing is observable. */
function queueOf(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `recipient-${String(i + 1)}`);
}

const NOW = new Date("2026-08-28T14:00:00.000Z");

function minutesBefore(minutes: number): Date {
  return new Date(NOW.getTime() - minutes * 60 * 1000);
}

function sends(...offsetsInMinutes: number[]): ManualSendRecord[] {
  return offsetsInMinutes.map((m) => ({ sentAt: minutesBefore(m) }));
}

describe("decideManualSendWindow — the corporate four-at-a-time screen gate", () => {
  it("exposes exactly 4 of a list of 30 for a corporate client", () => {
    const decision = decideManualSendWindow({
      grade: "CORPORATE",
      queue: queueOf(30),
      mailboxSendHistory: [],
      now: NOW,
    });

    expect(decision.gated).toBe(true);
    expect(decision.state).toBe("OPEN");
    expect(decision.exposed).toHaveLength(4);
    expect(decision.exposed).toEqual([
      "recipient-1",
      "recipient-2",
      "recipient-3",
      "recipient-4",
    ]);
    expect(decision.withheldCount).toBe(26);
  });

  it("keeps the 5th unreachable after 4 sends until 45 minutes have passed", () => {
    // All four sent five minutes ago — the group is complete, the clock is not.
    const decision = decideManualSendWindow({
      grade: "CORPORATE",
      queue: queueOf(26),
      mailboxSendHistory: sends(8, 7, 6, 5),
      now: NOW,
    });

    expect(decision.state).toBe("WAITING_ON_CLOCK");
    expect(decision.exposed).toHaveLength(0);
    expect(decision.withheldCount).toBe(26);
    expect(decision.nextGroupAvailableAt).toEqual(
      new Date(minutesBefore(5).getTime() + MANUAL_SEND_COOLDOWN_MINUTES * 60 * 1000),
    );
  });

  it("releases the next 4 once the 45 minutes have elapsed", () => {
    const decision = decideManualSendWindow({
      grade: "CORPORATE",
      queue: queueOf(26),
      mailboxSendHistory: sends(50, 49, 48, 46),
      now: NOW,
    });

    expect(decision.state).toBe("OPEN");
    expect(decision.exposed).toHaveLength(4);
    expect(decision.nextGroupAvailableAt).toBeNull();
  });

  it("keeps the 5th unreachable after 45 minutes if only 3 were sent", () => {
    // The clock is irrelevant while the group is unfinished: the 4th is
    // exposed, the 5th is not, no matter how long ago the 3 went.
    const decision = decideManualSendWindow({
      grade: "CORPORATE",
      queue: queueOf(27),
      mailboxSendHistory: sends(300, 290, 280),
      now: NOW,
    });

    expect(decision.state).toBe("WAITING_ON_SENDS");
    expect(decision.exposed).toHaveLength(1);
    expect(decision.exposed).toEqual(["recipient-1"]);
    expect(decision.withheldCount).toBe(26);
  });

  it("holds an independent clock for each mailbox on the same client", () => {
    // Same client, same grade, same queue — only the per-mailbox history
    // differs. The caller scopes the history; this proves the decision follows
    // it rather than leaking across mailboxes.
    const mailboxAJustFinished = decideManualSendWindow({
      grade: "CORPORATE",
      queue: queueOf(26),
      mailboxSendHistory: sends(4, 3, 2, 1),
      now: NOW,
    });
    const mailboxBHasSentNothing = decideManualSendWindow({
      grade: "CORPORATE",
      queue: queueOf(26),
      mailboxSendHistory: [],
      now: NOW,
    });

    expect(mailboxAJustFinished.state).toBe("WAITING_ON_CLOCK");
    expect(mailboxAJustFinished.exposed).toHaveLength(0);

    expect(mailboxBHasSentNothing.state).toBe("OPEN");
    expect(mailboxBHasSentNothing.exposed).toHaveLength(4);
  });

  it("does not gate a MID or STANDARD client, or one with no grade set", () => {
    for (const grade of ["MID", "STANDARD", null, undefined] as const) {
      const decision = decideManualSendWindow({
        grade,
        queue: queueOf(30),
        mailboxSendHistory: [],
        now: NOW,
      });
      expect(decision.gated).toBe(false);
      expect(decision.state).toBe("UNGATED");
      expect(decision.exposed).toHaveLength(30);
      expect(decision.withheldCount).toBe(0);
    }
  });

  it("never exposes more than the queue it was handed", () => {
    // The gate slices; it must never invent work. A corporate client with two
    // recipients left sees two, not four.
    const decision = decideManualSendWindow({
      grade: "CORPORATE",
      queue: queueOf(2),
      mailboxSendHistory: [],
      now: NOW,
    });
    expect(decision.exposed).toHaveLength(2);
    expect(decision.withheldCount).toBe(0);
  });

  it("reports an empty queue as EMPTY rather than pretending it is open", () => {
    const decision = decideManualSendWindow({
      grade: "CORPORATE",
      queue: [],
      mailboxSendHistory: sends(10, 9, 8, 7),
      now: NOW,
    });
    expect(decision.state).toBe("EMPTY");
    expect(decision.exposed).toHaveLength(0);
  });

  it("carries the group size and cooldown the owner asked for", () => {
    expect(MANUAL_SEND_GROUP_SIZE).toBe(4);
    expect(MANUAL_SEND_COOLDOWN_MINUTES).toBe(45);
  });

  it("gates the second group as strictly as the first", () => {
    // Eight sends = two complete groups. The gate must not treat "more than one
    // group done" as a reason to stop counting.
    const stillWaiting = decideManualSendWindow({
      grade: "CORPORATE",
      queue: queueOf(22),
      mailboxSendHistory: sends(20, 19, 18, 17, 3, 2, 1, 0.5),
      now: NOW,
    });
    expect(stillWaiting.state).toBe("WAITING_ON_CLOCK");
    expect(stillWaiting.exposed).toHaveLength(0);
  });
});
