import { describe, expect, it } from "vitest";

import { fairSendsThisLaunch } from "./mailbox-fair-share";

const jack = "mailbox-jack";

describe("fairSendsThisLaunch", () => {
  it("leaves a sequence that is alone on the pool exactly the paced remainder", () => {
    expect(
      fairSendsThisLaunch({
        sequenceId: "seq-a",
        mailboxId: jack,
        preferredMailboxId: null,
        pacedRemaining: 4,
        owners: [],
        autoPickPeers: 0,
      }),
    ).toBe(4);
  });

  it("does not let an auto-pick sequence spend a mailbox pinned to a waiting sequence", () => {
    expect(
      fairSendsThisLaunch({
        sequenceId: "seq-auto",
        mailboxId: jack,
        preferredMailboxId: null,
        pacedRemaining: 4,
        owners: [{ sequenceId: "seq-jack", sentToday: 0 }],
        autoPickPeers: 0,
      }),
    ).toBe(0);
  });

  it("does not let one pinned sequence fall through onto another sequence's mailbox", () => {
    expect(
      fairSendsThisLaunch({
        sequenceId: "seq-cam",
        mailboxId: jack,
        preferredMailboxId: "mailbox-cam",
        pacedRemaining: 4,
        owners: [{ sequenceId: "seq-jack", sentToday: 0 }],
        autoPickPeers: 0,
      }),
    ).toBe(0);
  });

  it("splits the open batch between two sequences pinned to the same mailbox", () => {
    expect(
      fairSendsThisLaunch({
        sequenceId: "seq-older",
        mailboxId: jack,
        preferredMailboxId: jack,
        pacedRemaining: 4,
        owners: [
          { sequenceId: "seq-older", sentToday: 0 },
          { sequenceId: "seq-jack", sentToday: 0 },
        ],
        autoPickPeers: 0,
      }),
    ).toBe(2);
  });

  it("stops a sequence that is already ahead of a waiting sequence on that mailbox", () => {
    expect(
      fairSendsThisLaunch({
        sequenceId: "seq-older",
        mailboxId: jack,
        preferredMailboxId: jack,
        pacedRemaining: 4,
        owners: [
          { sequenceId: "seq-older", sentToday: 4 },
          { sequenceId: "seq-jack", sentToday: 0 },
        ],
        autoPickPeers: 0,
      }),
    ).toBe(0);
  });

  it("lets the sequence that is behind take the slots the earlier sequence left", () => {
    expect(
      fairSendsThisLaunch({
        sequenceId: "seq-jack",
        mailboxId: jack,
        preferredMailboxId: jack,
        pacedRemaining: 4,
        owners: [
          { sequenceId: "seq-older", sentToday: 4 },
          { sequenceId: "seq-jack", sentToday: 0 },
        ],
        autoPickPeers: 0,
      }),
    ).toBe(4);
  });

  it("shares an unpinned mailbox across auto-pick sequences instead of giving it all to the first", () => {
    expect(
      fairSendsThisLaunch({
        sequenceId: "seq-older",
        mailboxId: "mailbox-shared",
        preferredMailboxId: null,
        pacedRemaining: 8,
        owners: [],
        autoPickPeers: 1,
      }),
    ).toBe(4);
  });

  it("still gives a pinned sequence its own mailbox when other sequences are only auto-pick", () => {
    expect(
      fairSendsThisLaunch({
        sequenceId: "seq-jack",
        mailboxId: jack,
        preferredMailboxId: jack,
        pacedRemaining: 4,
        owners: [{ sequenceId: "seq-jack", sentToday: 0 }],
        autoPickPeers: 3,
      }),
    ).toBe(4);
  });

  it("returns nothing when pacing has no slot open", () => {
    expect(
      fairSendsThisLaunch({
        sequenceId: "seq-jack",
        mailboxId: jack,
        preferredMailboxId: jack,
        pacedRemaining: 0,
        owners: [],
        autoPickPeers: 0,
      }),
    ).toBe(0);
  });
});
