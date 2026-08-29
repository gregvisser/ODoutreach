import { describe, expect, it } from "vitest";

import {
  assessRepEvidence,
  compareRateToPool,
  MIN_REP_SENDS,
  MIN_TOTAL_REPLIES,
  MIN_TOTAL_SENDS,
  type RepIdentity,
  type RepSendOutcome,
} from "./rep-performance-evidence";

/**
 * The tests that decide whether this feature is safe to show a manager.
 *
 * A screen that ranks named senders by reply rate is a performance-management
 * artefact whether or not anybody calls it one. The single thing that makes it
 * defensible is that it refuses to present a gap the arithmetic cannot tell
 * apart from luck — so that is what most of this file asserts.
 */

function outcomes(
  spec: readonly {
    id: string;
    sent: number;
    replied: number;
    positive?: number;
    bounced?: number;
  }[],
): RepSendOutcome[] {
  const rows: RepSendOutcome[] = [];
  for (const rep of spec) {
    for (let i = 0; i < rep.sent; i += 1) {
      rows.push({
        mailboxIdentityId: rep.id,
        replied: i < rep.replied,
        positive: i < (rep.positive ?? 0),
        bounced: i >= rep.sent - (rep.bounced ?? 0),
      });
    }
  }
  return rows;
}

const IDENTITIES: RepIdentity[] = [
  { mailboxIdentityId: "a", label: "Alex — alex@acme.co.uk" },
  { mailboxIdentityId: "b", label: "Bev — bev@acme.co.uk" },
];

describe("compareRateToPool", () => {
  it("calls a four-point gap on 150 sends each what it is: not distinguishable", () => {
    // THE TEST THIS FEATURE EXISTS FOR. 4% against 8% looks like one sender
    // being twice as good as the other. On 150 sends each it is z = 1.46 — the
    // kind of gap a fair coin produces all day. Shipping this as a finding is
    // how somebody gets managed out over sampling noise.
    const result = compareRateToPool({
      successes: 6,
      trials: 150,
      poolSuccesses: 12,
      poolTrials: 150,
    });
    expect(result.kind).toBe("indistinguishable");
  });

  it("calls a real gap real, and says which way round it is", () => {
    const below = compareRateToPool({
      successes: 10,
      trials: 500,
      poolSuccesses: 60,
      poolTrials: 500,
    });
    const above = compareRateToPool({
      successes: 60,
      trials: 500,
      poolSuccesses: 10,
      poolTrials: 500,
    });

    expect(below.kind).toBe("below");
    expect(above.kind).toBe("above");
    if (below.kind === "indistinguishable" || above.kind === "indistinguishable") {
      throw new Error("unreachable");
    }
    expect(Math.abs(below.zScore)).toBeGreaterThan(6);
    expect(Math.abs(above.zScore)).toBeGreaterThan(6);
  });

  it("never claims a difference when there is nothing to compare against", () => {
    // An empty pool makes the standard error zero and the z-score infinite.
    // Dividing by it would report a certainty from a single sender.
    expect(
      compareRateToPool({
        successes: 30,
        trials: 500,
        poolSuccesses: 0,
        poolTrials: 0,
      }).kind,
    ).toBe("indistinguishable");
  });

  it("never claims a difference when nobody replied at all", () => {
    // Pooled rate 0 also makes the standard error zero. Two senders on 0% are
    // the same sender, not two certainties.
    expect(
      compareRateToPool({
        successes: 0,
        trials: 500,
        poolSuccesses: 0,
        poolTrials: 500,
      }).kind,
    ).toBe("indistinguishable");
  });
});

describe("assessRepEvidence", () => {
  it("refuses, naming sends, when no sender has sent enough to be compared", () => {
    const verdict = assessRepEvidence(
      outcomes([
        { id: "a", sent: 50, replied: 4 },
        { id: "b", sent: 50, replied: 1 },
      ]),
      IDENTITIES,
    );

    expect(verdict.sufficient).toBe(false);
    if (verdict.sufficient) throw new Error("unreachable");
    expect(verdict.reason).toContain(String(MIN_TOTAL_SENDS));
    // The operator has to be told WHY their 100 sends counted as zero.
    expect(verdict.reason).toContain(String(MIN_REP_SENDS));
  });

  it("refuses when only one sender clears the bar, because one is not a comparison", () => {
    const verdict = assessRepEvidence(
      outcomes([
        { id: "a", sent: 500, replied: 30 },
        { id: "b", sent: 50, replied: 2 },
      ]),
      IDENTITIES,
    );

    expect(verdict.sufficient).toBe(false);
    if (verdict.sufficient) throw new Error("unreachable");
    expect(verdict.reason).toContain("one sender");
  });

  it("refuses when there are plenty of sends but almost no replies", () => {
    const verdict = assessRepEvidence(
      outcomes([
        { id: "a", sent: 500, replied: 5 },
        { id: "b", sent: 500, replied: 4 },
      ]),
      IDENTITIES,
    );

    expect(verdict.sufficient).toBe(false);
    if (verdict.sufficient) throw new Error("unreachable");
    expect(verdict.reason).toContain(String(MIN_TOTAL_REPLIES));
  });

  it("drops thin senders from the table AND from the totals, so the two agree", () => {
    // The same rule as the send-time table: a headline total that counted rows
    // the operator cannot see is a reconciliation question nobody can answer.
    const verdict = assessRepEvidence(
      outcomes([
        { id: "a", sent: 500, replied: 30 },
        { id: "b", sent: 500, replied: 25 },
        { id: "c", sent: 40, replied: 9 },
      ]),
      IDENTITIES,
    );

    expect(verdict.sufficient).toBe(true);
    if (!verdict.sufficient) throw new Error("unreachable");
    expect(verdict.reps.map((r) => r.mailboxIdentityId)).toEqual(["a", "b"]);
    expect(verdict.totalSent).toBe(1_000);
    expect(verdict.totalReplied).toBe(55);
    expect(verdict.reps.reduce((sum, r) => sum + r.sent, 0)).toBe(verdict.totalSent);
  });

  it("reports two evenly-matched senders as indistinguishable, not as a ranking", () => {
    const verdict = assessRepEvidence(
      outcomes([
        { id: "a", sent: 500, replied: 30 },
        { id: "b", sent: 500, replied: 25 },
      ]),
      IDENTITIES,
    );

    expect(verdict.sufficient).toBe(true);
    if (!verdict.sufficient) throw new Error("unreachable");
    expect(verdict.anyDistinguishable).toBe(false);
    expect(verdict.reps.every((r) => r.comparison.kind === "indistinguishable")).toBe(
      true,
    );
  });

  it("flags a genuinely different sender, and counts positives and bounces", () => {
    const verdict = assessRepEvidence(
      outcomes([
        { id: "a", sent: 500, replied: 60, positive: 20, bounced: 5 },
        { id: "b", sent: 500, replied: 10, positive: 1, bounced: 90 },
      ]),
      IDENTITIES,
    );

    expect(verdict.sufficient).toBe(true);
    if (!verdict.sufficient) throw new Error("unreachable");
    expect(verdict.anyDistinguishable).toBe(true);

    const alex = verdict.reps.find((r) => r.mailboxIdentityId === "a");
    const bev = verdict.reps.find((r) => r.mailboxIdentityId === "b");
    expect(alex?.comparison.kind).toBe("above");
    expect(bev?.comparison.kind).toBe("below");

    expect(alex?.replyRatePercent).toBe(12);
    expect(alex?.positive).toBe(20);
    expect(bev?.bounced).toBe(90);
    expect(bev?.bounceRatePercent).toBe(18);
    expect(verdict.totalPositive).toBe(21);
    expect(verdict.totalBounced).toBe(95);
  });

  it("labels a sender whose mailbox row has since been deleted, rather than dropping the sends", () => {
    // `OutboundEmail.mailboxIdentityId` is `onDelete: SetNull`, but a mailbox
    // REMOVED from the workspace keeps its id on historical sends while no
    // longer appearing in the identity list. Those sends still happened and
    // still belong in the client's totals.
    const verdict = assessRepEvidence(
      outcomes([
        { id: "a", sent: 500, replied: 30 },
        { id: "gone", sent: 500, replied: 28 },
      ]),
      IDENTITIES,
    );

    expect(verdict.sufficient).toBe(true);
    if (!verdict.sufficient) throw new Error("unreachable");
    const removed = verdict.reps.find((r) => r.mailboxIdentityId === "gone");
    expect(removed).toBeDefined();
    expect(removed?.label).toContain("no longer");
  });

  it("sorts the table by reply rate so the screen order never depends on the query", () => {
    const verdict = assessRepEvidence(
      outcomes([
        { id: "b", sent: 500, replied: 10 },
        { id: "a", sent: 500, replied: 60 },
      ]),
      IDENTITIES,
    );

    expect(verdict.sufficient).toBe(true);
    if (!verdict.sufficient) throw new Error("unreachable");
    expect(verdict.reps.map((r) => r.mailboxIdentityId)).toEqual(["a", "b"]);
  });
});
