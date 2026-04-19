import { describe, expect, it } from "vitest";

import {
  assignPilotTargetsToMailboxesGreedy,
  sumAggregateRemainingAcrossEligible,
} from "./outreach-mailbox-model";

describe("sumAggregateRemainingAcrossEligible", () => {
  it("sums remaining only for eligible, non-ledger-capped mailboxes", () => {
    const n = sumAggregateRemainingAcrossEligible([
      { eligible: true, atLedgerCap: false, remaining: 10 },
      { eligible: false, atLedgerCap: false, remaining: 99 },
      { eligible: true, atLedgerCap: true, remaining: 5 },
    ]);
    expect(n).toBe(10);
  });
});

describe("assignPilotTargetsToMailboxesGreedy", () => {
  it("spreads recipients across mailboxes with the most remaining first", () => {
    const remainingByMailboxId = new Map([
      ["a", 1],
      ["b", 3],
    ]);
    const primaryByMailboxId = new Map([
      ["a", true],
      ["b", false],
    ]);
    const { assignments, unassignedCount } = assignPilotTargetsToMailboxesGreedy({
      targetCount: 3,
      remainingByMailboxId,
      primaryByMailboxId,
    });
    expect(unassignedCount).toBe(0);
    expect(assignments[0]).toBe("b");
    expect(assignments[1]).toBe("b");
    // Third send: remaining equal — primary mailbox `a` wins the tie-break
    expect(assignments[2]).toBe("a");
  });

  it("uses primary as tiebreaker when remaining is equal", () => {
    const remainingByMailboxId = new Map([
      ["p", 2],
      ["s", 2],
    ]);
    const primaryByMailboxId = new Map([
      ["p", true],
      ["s", false],
    ]);
    const { assignments } = assignPilotTargetsToMailboxesGreedy({
      targetCount: 1,
      remainingByMailboxId,
      primaryByMailboxId,
    });
    expect(assignments[0]).toBe("p");
  });
});
