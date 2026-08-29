import { describe, expect, it } from "vitest";

import {
  assessTitleMessageEvidence,
  bonferroniZThreshold,
  inverseNormalCdf,
  MIN_CELL_ENROLLMENTS,
  MIN_TOTAL_REPLIES,
  type MessageIdentity,
  type TitleMessageOutcome,
} from "./title-message-evidence";

const MESSAGES: MessageIdentity[] = [
  { sequenceId: "seq-a", label: "Cost-saving campaign" },
  { sequenceId: "seq-b", label: "Compliance campaign" },
];

/**
 * Build enrollments for one (title, sequence) cell.
 *
 * `replied` of them replied; a third of those were positive. Deterministic, so
 * a failure points at the arithmetic rather than at a random draw.
 */
function cell(spec: {
  title: string | null;
  sequenceId: string;
  enrollments: number;
  replied: number;
}): TitleMessageOutcome[] {
  const rows: TitleMessageOutcome[] = [];
  for (let i = 0; i < spec.enrollments; i += 1) {
    rows.push({
      sequenceId: spec.sequenceId,
      title: spec.title,
      replied: i < spec.replied,
      positive: i < Math.floor(spec.replied / 3),
    });
  }
  return rows;
}

describe("inverseNormalCdf", () => {
  it("reproduces the standard normal quantiles a statistics table gives", () => {
    expect(inverseNormalCdf(0.975)).toBeCloseTo(1.959964, 4);
    expect(inverseNormalCdf(0.995)).toBeCloseTo(2.575829, 4);
    expect(inverseNormalCdf(0.9995)).toBeCloseTo(3.290527, 4);
    expect(inverseNormalCdf(0.5)).toBeCloseTo(0, 6);
    // Symmetric about the median.
    expect(inverseNormalCdf(0.025)).toBeCloseTo(-1.959964, 4);
  });

  it("returns NaN outside the open interval rather than a wrong number", () => {
    expect(inverseNormalCdf(0)).toBeNaN();
    expect(inverseNormalCdf(1)).toBeNaN();
    expect(inverseNormalCdf(-0.5)).toBeNaN();
  });
});

describe("bonferroniZThreshold", () => {
  it("is the conventional two-standard-error bar for a single comparison", () => {
    expect(bonferroniZThreshold(1)).toBe(2);
    expect(bonferroniZThreshold(0)).toBe(2);
  });

  it("raises the bar as more cells are compared at once", () => {
    const four = bonferroniZThreshold(4);
    const twenty = bonferroniZThreshold(20);
    expect(four).toBeGreaterThan(2);
    expect(twenty).toBeGreaterThan(four);
    // 0.05 spread over 20 comparisons is a two-sided 0.0025 tail.
    expect(twenty).toBeCloseTo(inverseNormalCdf(1 - 0.05 / 20 / 2), 6);
  });

  it("never drops below the single-comparison bar", () => {
    expect(bonferroniZThreshold(1)).toBeGreaterThanOrEqual(2);
    expect(bonferroniZThreshold(Number.NaN)).toBe(2);
  });
});

describe("assessTitleMessageEvidence — the refusals", () => {
  it("refuses when nobody has been enrolled", () => {
    const verdict = assessTitleMessageEvidence([], MESSAGES);
    expect(verdict.sufficient).toBe(false);
    if (verdict.sufficient) return;
    expect(verdict.reason).toMatch(/nobody has been enrolled/i);
  });

  /**
   * THE HEADLINE REFUSAL. A family that only ever received ONE campaign has
   * nothing to compare that campaign against, and the reason has to say so —
   * "not enough data" would send an operator looking for more contacts when
   * what they need is a second campaign.
   */
  it("refuses a family that has only ever been sent one campaign", () => {
    const outcomes = cell({
      title: "Operations Manager",
      sequenceId: "seq-a",
      enrollments: 900,
      replied: 90,
    });

    const verdict = assessTitleMessageEvidence(outcomes, MESSAGES);
    expect(verdict.sufficient).toBe(false);
    if (verdict.sufficient) return;
    expect(verdict.reason).toMatch(/two different campaigns/i);
  });

  it("refuses when no job titles were recorded, and says that is the problem", () => {
    const outcomes = [
      ...cell({ title: null, sequenceId: "seq-a", enrollments: 500, replied: 50 }),
      ...cell({ title: null, sequenceId: "seq-b", enrollments: 500, replied: 20 }),
    ];

    const verdict = assessTitleMessageEvidence(outcomes, MESSAGES);
    expect(verdict.sufficient).toBe(false);
    if (verdict.sufficient) return;
    expect(verdict.reason).toMatch(/no title at all/i);
  });

  it("refuses when the titles are all ungroupable, and says so differently", () => {
    const outcomes = [
      ...cell({ title: "Director", sequenceId: "seq-a", enrollments: 500, replied: 50 }),
      ...cell({ title: "Director", sequenceId: "seq-b", enrollments: 500, replied: 20 }),
    ];

    const verdict = assessTitleMessageEvidence(outcomes, MESSAGES);
    expect(verdict.sufficient).toBe(false);
    if (verdict.sufficient) return;
    expect(verdict.reason).toMatch(/none of the job titles.*could be grouped/i);
  });

  it("refuses a cell below the per-cell minimum however lopsided it looks", () => {
    const outcomes = [
      ...cell({
        title: "Operations Manager",
        sequenceId: "seq-a",
        enrollments: 400,
        replied: 40,
      }),
      // Ten people, five replies — a 50% rate, and meaningless.
      ...cell({
        title: "Operations Manager",
        sequenceId: "seq-b",
        enrollments: MIN_CELL_ENROLLMENTS - 1,
        replied: 30,
      }),
    ];

    const verdict = assessTitleMessageEvidence(outcomes, MESSAGES);
    expect(verdict.sufficient).toBe(false);
    if (verdict.sufficient) return;
    expect(verdict.reason).toMatch(/two different campaigns/i);
  });

  it("refuses when the replies are too few, whatever the enrollment counts", () => {
    const outcomes = [
      ...cell({ title: "Operations Manager", sequenceId: "seq-a", enrollments: 600, replied: 8 }),
      ...cell({ title: "Operations Manager", sequenceId: "seq-b", enrollments: 600, replied: 8 }),
    ];

    const verdict = assessTitleMessageEvidence(outcomes, MESSAGES);
    expect(verdict.sufficient).toBe(false);
    if (verdict.sufficient) return;
    expect(verdict.reason).toContain(String(MIN_TOTAL_REPLIES));
  });
});

describe("assessTitleMessageEvidence — the comparison", () => {
  /**
   * THE RED-FIRST ASSERTION FOR THIS CYCLE. Two campaigns sent to the same
   * audience, differing by an amount well inside chance, must come back
   * indistinguishable — and `anyDistinguishable` must be false, because that
   * single flag is what decides whether the screen claims a winner at all.
   */
  it("calls a gap that is inside chance indistinguishable", () => {
    const outcomes = [
      ...cell({ title: "Operations Manager", sequenceId: "seq-a", enrollments: 500, replied: 30 }),
      ...cell({ title: "Operations Manager", sequenceId: "seq-b", enrollments: 500, replied: 26 }),
    ];

    const verdict = assessTitleMessageEvidence(outcomes, MESSAGES);
    expect(verdict.sufficient).toBe(true);
    if (!verdict.sufficient) return;

    expect(verdict.anyDistinguishable).toBe(false);
    for (const family of verdict.families) {
      expect(family.anyDistinguishable).toBe(false);
      for (const message of family.messages) {
        expect(message.comparison.kind).toBe("indistinguishable");
      }
    }
  });

  it("finds a gap that is far outside chance, and names the winning campaign", () => {
    const outcomes = [
      ...cell({ title: "Operations Manager", sequenceId: "seq-a", enrollments: 800, replied: 160 }),
      ...cell({ title: "Operations Manager", sequenceId: "seq-b", enrollments: 800, replied: 24 }),
    ];

    const verdict = assessTitleMessageEvidence(outcomes, MESSAGES);
    expect(verdict.sufficient).toBe(true);
    if (!verdict.sufficient) return;

    expect(verdict.anyDistinguishable).toBe(true);
    const [family] = verdict.families;
    expect(family.label).toBe("Operations");
    // Sorted best-first, so the winner is the row an operator reads first.
    expect(family.messages[0].label).toBe("Cost-saving campaign");
    expect(family.messages[0].comparison.kind).toBe("above");
    expect(family.messages[1].comparison.kind).toBe("below");
  });

  /**
   * THE MULTIPLE-COMPARISON GUARD, which is the property this feature has and
   * the sender comparison did not need. The same borderline gap must survive
   * when it is the only comparison and be demoted when it is one of many —
   * otherwise a client with a dozen audiences gets a spurious "winner" every
   * time they press the button.
   */
  it("demotes a borderline gap once many cells are compared at once", () => {
    const borderline = (title: string): TitleMessageOutcome[] => [
      ...cell({ title, sequenceId: "seq-a", enrollments: 700, replied: 77 }),
      ...cell({ title, sequenceId: "seq-b", enrollments: 700, replied: 49 }),
    ];

    const alone = assessTitleMessageEvidence(borderline("Operations Manager"), MESSAGES);
    expect(alone.sufficient).toBe(true);
    if (!alone.sufficient) return;
    expect(alone.comparisonCount).toBe(2);
    expect(alone.anyDistinguishable).toBe(true);

    // The SAME gap, now sitting alongside four other audiences whose campaigns
    // are level. Nothing about the Operations numbers changed.
    const crowded = assessTitleMessageEvidence(
      [
        ...borderline("Operations Manager"),
        ...cell({ title: "Finance Director", sequenceId: "seq-a", enrollments: 700, replied: 63 }),
        ...cell({ title: "Finance Director", sequenceId: "seq-b", enrollments: 700, replied: 63 }),
        ...cell({ title: "HR Manager", sequenceId: "seq-a", enrollments: 700, replied: 63 }),
        ...cell({ title: "HR Manager", sequenceId: "seq-b", enrollments: 700, replied: 63 }),
        ...cell({ title: "IT Manager", sequenceId: "seq-a", enrollments: 700, replied: 63 }),
        ...cell({ title: "IT Manager", sequenceId: "seq-b", enrollments: 700, replied: 63 }),
        ...cell({ title: "Marketing Manager", sequenceId: "seq-a", enrollments: 700, replied: 63 }),
        ...cell({ title: "Marketing Manager", sequenceId: "seq-b", enrollments: 700, replied: 63 }),
      ],
      MESSAGES,
    );
    expect(crowded.sufficient).toBe(true);
    if (!crowded.sufficient) return;

    expect(crowded.comparisonCount).toBe(10);
    expect(crowded.zThreshold).toBeGreaterThan(alone.zThreshold);
    expect(crowded.anyDistinguishable).toBe(false);
  });

  it("compares a message only against the same audience, never across audiences", () => {
    // Operations reply far more than Finance, but WITHIN each audience the two
    // campaigns are level. A comparison that pooled audiences would call the
    // Operations rows a winner; this one must not.
    const outcomes = [
      ...cell({ title: "Operations Manager", sequenceId: "seq-a", enrollments: 500, replied: 100 }),
      ...cell({ title: "Operations Manager", sequenceId: "seq-b", enrollments: 500, replied: 100 }),
      ...cell({ title: "Finance Director", sequenceId: "seq-a", enrollments: 500, replied: 15 }),
      ...cell({ title: "Finance Director", sequenceId: "seq-b", enrollments: 500, replied: 15 }),
    ];

    const verdict = assessTitleMessageEvidence(outcomes, MESSAGES);
    expect(verdict.sufficient).toBe(true);
    if (!verdict.sufficient) return;
    expect(verdict.anyDistinguishable).toBe(false);
    expect(verdict.families).toHaveLength(2);
  });

  it("reports how much of the outreach the table is silent about", () => {
    const outcomes = [
      ...cell({ title: "Operations Manager", sequenceId: "seq-a", enrollments: 400, replied: 40 }),
      ...cell({ title: "Operations Manager", sequenceId: "seq-b", enrollments: 400, replied: 40 }),
      ...cell({ title: null, sequenceId: "seq-a", enrollments: 100, replied: 5 }),
      ...cell({ title: "Director", sequenceId: "seq-a", enrollments: 100, replied: 5 }),
      // Grouped, but far too thin to compare.
      ...cell({ title: "CFO", sequenceId: "seq-a", enrollments: 20, replied: 2 }),
    ];

    const verdict = assessTitleMessageEvidence(outcomes, MESSAGES);
    expect(verdict.sufficient).toBe(true);
    if (!verdict.sufficient) return;

    const { coverage } = verdict;
    expect(coverage.totalEnrollments).toBe(1_020);
    expect(coverage.missingTitle).toBe(100);
    expect(coverage.ungrouped).toBe(100);
    expect(coverage.compared).toBe(800);
    expect(coverage.tooThinToCompare).toBe(20);
    // Every enrollment is accounted for in exactly one of the four buckets.
    expect(
      coverage.missingTitle +
        coverage.ungrouped +
        coverage.tooThinToCompare +
        coverage.compared,
    ).toBe(coverage.totalEnrollments);
    expect(coverage.comparedPercent).toBe(78);
  });

  it("labels a campaign that has since been deleted rather than dropping its people", () => {
    const outcomes = [
      ...cell({ title: "Operations Manager", sequenceId: "seq-a", enrollments: 400, replied: 40 }),
      ...cell({ title: "Operations Manager", sequenceId: "seq-gone", enrollments: 400, replied: 40 }),
    ];

    const verdict = assessTitleMessageEvidence(outcomes, MESSAGES);
    expect(verdict.sufficient).toBe(true);
    if (!verdict.sufficient) return;
    const labels = verdict.families[0].messages.map((m) => m.label);
    expect(labels).toContain("A campaign that is no longer in this workspace");
  });

  it("orders families and messages deterministically across identical runs", () => {
    const outcomes = [
      ...cell({ title: "Operations Manager", sequenceId: "seq-a", enrollments: 400, replied: 40 }),
      ...cell({ title: "Operations Manager", sequenceId: "seq-b", enrollments: 400, replied: 40 }),
      ...cell({ title: "Finance Director", sequenceId: "seq-a", enrollments: 300, replied: 30 }),
      ...cell({ title: "Finance Director", sequenceId: "seq-b", enrollments: 300, replied: 30 }),
    ];

    const first = assessTitleMessageEvidence(outcomes, MESSAGES);
    const second = assessTitleMessageEvidence([...outcomes].reverse(), MESSAGES);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));

    if (!first.sufficient) return;
    // Largest audience first.
    expect(first.families.map((f) => f.label)).toEqual(["Operations", "Finance"]);
  });
});
