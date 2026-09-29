import { describe, expect, it } from "vitest";

import {
  contendersForMailbox,
  fairShareSentKey,
  fairSendsThisLaunch,
  type MailboxSequenceContender,
} from "./mailbox-fair-share";

const jack = "mailbox-jack";
const cam = "mailbox-cam";

function drainMailbox(
  open: number,
  demand: Record<string, number>,
): { sent: Record<string, number>; remaining: number } {
  const ids = Object.keys(demand);
  const sent: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
  let remaining = open;
  for (let guard = 0; guard < 40 && remaining > 0; guard += 1) {
    let moved = false;
    for (const id of ids) {
      if ((demand[id] ?? 0) <= 0 || remaining <= 0) continue;
      const contenders: MailboxSequenceContender[] = ids
        .filter((other) => other === id || (demand[other] ?? 0) > 0)
        .map((other) => ({ sequenceId: other, sentToday: sent[other] ?? 0 }));
      const share = fairSendsThisLaunch({
        sequenceId: id,
        pacedRemaining: remaining,
        contenders,
      });
      const take = Math.min(share, demand[id] ?? 0, remaining);
      if (take <= 0) continue;
      sent[id] = (sent[id] ?? 0) + take;
      demand[id] = (demand[id] ?? 0) - take;
      remaining -= take;
      moved = true;
    }
    if (!moved) break;
  }
  return { sent, remaining };
}

describe("fairSendsThisLaunch", () => {
  it("gives a sequence that is alone on a mailbox that mailbox's full open allowance", () => {
    expect(
      fairSendsThisLaunch({
        sequenceId: "seq",
        pacedRemaining: 30,
        contenders: [{ sequenceId: "seq", sentToday: 0 }],
      }),
    ).toBe(30);
  });

  it("lets two mailboxes each send the same sequence up to their own cap", () => {
    const readySequenceIds = ["seq"];
    const sentTodayByMailboxSequence = new Map<string, number>([
      [fairShareSentKey(jack, "seq"), 30],
    ]);
    const onJack = contendersForMailbox({
      mailboxId: jack,
      readySequenceIds,
      sentTodayByMailboxSequence,
    });
    const onCam = contendersForMailbox({
      mailboxId: cam,
      readySequenceIds,
      sentTodayByMailboxSequence,
    });
    expect(fairSendsThisLaunch({
      sequenceId: "seq",
      pacedRemaining: 0,
      contenders: onJack,
    })).toBe(0);
    expect(onCam).toEqual([{ sequenceId: "seq", sentToday: 0 }]);
    expect(fairSendsThisLaunch({
      sequenceId: "seq",
      pacedRemaining: 30,
      contenders: onCam,
    })).toBe(30);
  });

  it("does not borrow another mailbox's spare to exceed this mailbox's cap", () => {
    const share = fairSendsThisLaunch({
      sequenceId: "seq",
      pacedRemaining: 4,
      contenders: [{ sequenceId: "seq", sentToday: 0 }],
    });
    expect(share).toBe(4);
    expect(share).toBeLessThanOrEqual(4);
  });

  it("splits one mailbox between two sequences and does not starve the one behind", () => {
    const even: MailboxSequenceContender[] = [
      { sequenceId: "older", sentToday: 0 },
      { sequenceId: "later", sentToday: 0 },
    ];
    expect(fairSendsThisLaunch({
      sequenceId: "older",
      pacedRemaining: 4,
      contenders: even,
    })).toBe(2);
    expect(fairSendsThisLaunch({
      sequenceId: "later",
      pacedRemaining: 4,
      contenders: even,
    })).toBe(2);

    const olderAhead: MailboxSequenceContender[] = [
      { sequenceId: "older", sentToday: 4 },
      { sequenceId: "later", sentToday: 0 },
    ];
    expect(fairSendsThisLaunch({
      sequenceId: "older",
      pacedRemaining: 4,
      contenders: olderAhead,
    })).toBe(0);
    expect(fairSendsThisLaunch({
      sequenceId: "later",
      pacedRemaining: 4,
      contenders: olderAhead,
    })).toBe(4);
  });

  it("fills each mailbox to its own cap when two sequences share both", () => {
    const jackDrain = drainMailbox(8, { older: 100, later: 100 });
    const camDrain = drainMailbox(8, { older: 100, later: 100 });
    expect(jackDrain.remaining).toBe(0);
    expect(camDrain.remaining).toBe(0);
    expect((jackDrain.sent.older ?? 0) + (jackDrain.sent.later ?? 0)).toBe(8);
    expect((camDrain.sent.older ?? 0) + (camDrain.sent.later ?? 0)).toBe(8);
    expect(jackDrain.sent.older).toBeGreaterThan(0);
    expect(jackDrain.sent.later).toBeGreaterThan(0);
    expect(Math.abs((jackDrain.sent.older ?? 0) - (jackDrain.sent.later ?? 0))).toBeLessThanOrEqual(1);
    expect(jackDrain.sent.older).toBeLessThanOrEqual(8);
    expect(camDrain.sent.later).toBeLessThanOrEqual(8);
  });

  it("keeps a single sequence inside each mailbox cap across a day's ticks", () => {
    const caps = { jack: 10, cam: 10 };
    const used = { jack: 0, cam: 0 };
    let demand = 40;
    for (const mailboxId of ["jack", "cam"] as const) {
      const share = fairSendsThisLaunch({
        sequenceId: "seq",
        pacedRemaining: caps[mailboxId] - used[mailboxId],
        contenders: [{ sequenceId: "seq", sentToday: used[mailboxId] }],
      });
      const take = Math.min(share, demand);
      used[mailboxId] += take;
      demand -= take;
    }
    expect(used.jack).toBe(10);
    expect(used.cam).toBe(10);
    expect(used.jack).toBeLessThanOrEqual(caps.jack);
    expect(used.cam).toBeLessThanOrEqual(caps.cam);
    expect(demand).toBe(20);
  });

  it("returns nothing when this mailbox has no slot open", () => {
    expect(
      fairSendsThisLaunch({
        sequenceId: "seq",
        pacedRemaining: 0,
        contenders: [
          { sequenceId: "seq", sentToday: 0 },
          { sequenceId: "other", sentToday: 0 },
        ],
      }),
    ).toBe(0);
  });
});
