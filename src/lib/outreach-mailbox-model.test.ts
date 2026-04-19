import { describe, expect, it } from "vitest";

import {
  assignPilotTargetsToMailboxesGreedy,
  formatOutreachMailboxCapacityChecklistDetail,
  getOutreachMailboxCapacityTier,
  sumAggregateRemainingAcrossEligible,
} from "./outreach-mailbox-model";

describe("getOutreachMailboxCapacityTier", () => {
  it("returns none when no eligible mailboxes", () => {
    expect(getOutreachMailboxCapacityTier(0)).toBe("none");
  });
  it("returns reduced for 1–4 connected eligible mailboxes", () => {
    expect(getOutreachMailboxCapacityTier(1)).toBe("reduced");
    expect(getOutreachMailboxCapacityTier(4)).toBe("reduced");
  });
  it("returns max_recommended at five", () => {
    expect(getOutreachMailboxCapacityTier(5)).toBe("max_recommended");
  });
});

describe("formatOutreachMailboxCapacityChecklistDetail", () => {
  it("describes blocked state at zero", () => {
    expect(formatOutreachMailboxCapacityChecklistDetail(0)).toContain("connect at least one");
  });
  it("describes reduced capacity for 1–4", () => {
    expect(formatOutreachMailboxCapacityChecklistDetail(2)).toContain("Ready with reduced daily capacity");
  });
  it("describes full tier at five", () => {
    expect(formatOutreachMailboxCapacityChecklistDetail(5)).toContain("Fully provisioned");
  });
});

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
