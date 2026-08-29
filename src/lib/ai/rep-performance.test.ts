import { describe, expect, it } from "vitest";

import type { RepStat } from "./rep-performance-evidence";
import {
  buildRepPerformanceInput,
  MAX_FINDINGS,
  parseRepPerformanceToolUse,
  REP_PERFORMANCE_SYSTEM_PROMPT,
  REP_PERFORMANCE_TOOL,
  verdictPhrase,
} from "./rep-performance";

function rep(overrides: Partial<RepStat> = {}): RepStat {
  return {
    mailboxIdentityId: "a",
    label: "Alex — alex@acme.co.uk",
    sent: 500,
    replied: 60,
    positive: 20,
    bounced: 5,
    replyRatePercent: 12,
    positiveRatePercent: 4,
    bounceRatePercent: 1,
    comparison: { kind: "indistinguishable" },
    bounceComparison: { kind: "indistinguishable" },
    ...overrides,
  };
}

function toolUse(input: unknown) {
  return [{ type: "tool_use", name: REP_PERFORMANCE_TOOL.name, input }];
}

const VALID_FINDING = {
  senderLabel: "Bev — bev@acme.co.uk",
  observation: "2% reply rate against 12% for the others, on 500 sends.",
  likelyCauses: ["The domain may not be passing DMARC.", "Warm-up may be incomplete."],
  checkFirst: "Check SPF, DKIM and DMARC on that mailbox's sending domain.",
};

describe("the tool schema cannot express a judgement about a person", () => {
  /**
   * These assertions are the structural half of the guardrail described in the
   * file header. They are deliberately written against the SCHEMA rather than
   * against a response, because a field that exists will eventually be filled,
   * and a field that is never defined cannot be.
   */
  const properties = REP_PERFORMANCE_TOOL.input_schema.properties;
  const findingProps = properties.findings.items.properties;

  it("offers no score, rating, rank or grade at any level", () => {
    const forbidden = ["score", "rating", "rank", "grade", "percentile", "stars"];
    const top = Object.keys(properties);
    const perFinding = Object.keys(findingProps);
    for (const field of forbidden) {
      expect(top).not.toContain(field);
      expect(perFinding).not.toContain(field);
    }
  });

  it("offers no field for an action about a person", () => {
    const perFinding = Object.keys(findingProps);
    for (const field of ["recommendation", "action", "coaching", "training"]) {
      expect(perFinding).not.toContain(field);
    }
    // What it DOES offer is a technical check on the mailbox.
    expect(perFinding).toContain("checkFirst");
  });

  it("tells the model the four facts that stop it blaming the writing", () => {
    // Sequences are client-scoped — verified against the schema. Without this
    // the fluent wrong answer is "Alex writes better subject lines".
    expect(REP_PERFORMANCE_SYSTEM_PROMPT).toContain("THE SAME WORDS");
    expect(REP_PERFORMANCE_SYSTEM_PROMPT).toContain("No person chooses who they email");
    expect(REP_PERFORMANCE_SYSTEM_PROMPT).toContain("never an effort one");
    expect(REP_PERFORMANCE_SYSTEM_PROMPT).toContain("not appraising staff");
  });
});

describe("buildRepPerformanceInput", () => {
  it("carries our counts and our verdict, not raw z-scores", () => {
    const text = buildRepPerformanceInput({
      clientName: "Acme Safety",
      industry: "Health and safety consulting",
      reps: [
        rep({ comparison: { kind: "above", zScore: 6.2 } }),
        rep({
          mailboxIdentityId: "b",
          label: "Bev — bev@acme.co.uk",
          replied: 10,
          replyRatePercent: 2,
          comparison: { kind: "below", zScore: -6.2 },
        }),
      ],
      totalSent: 1_000,
      totalReplied: 70,
      totalPositive: 21,
      lookbackDays: 180,
      anyDistinguishable: true,
    });

    expect(text).toContain("Alex — alex@acme.co.uk | sent 500 | replies 60 (12%)");
    expect(text).toContain("MORE than the others by more than chance");
    expect(text).toContain("FEWER than the others by more than chance");
    expect(text).toContain("1000 emails sent, 70 replies, 21 of them positive");
    // The z-score is ours to reason with, not the model's to quote at a human.
    expect(text).not.toContain("6.2");
  });

  it("states plainly, in the prompt, when there is no real difference at all", () => {
    // The most important line in the input. Without it the model is shown a
    // table of unequal-looking numbers and asked to explain them, which is an
    // invitation to invent a cause for noise.
    const text = buildRepPerformanceInput({
      clientName: "Acme Safety",
      industry: null,
      reps: [rep(), rep({ mailboxIdentityId: "b", label: "Bev" })],
      totalSent: 1_000,
      totalReplied: 55,
      totalPositive: 12,
      lookbackDays: 180,
      anyDistinguishable: false,
    });

    expect(text).toContain("NO sender differs from the others by more than chance");
    expect(text).toContain("leave findings empty");
  });
});

describe("verdictPhrase", () => {
  it("reports replies and bounces separately", () => {
    // Conflating them would send somebody to a coaching conversation about a
    // broken DNS record.
    const phrase = verdictPhrase(
      rep({
        comparison: { kind: "indistinguishable" },
        bounceComparison: { kind: "above", zScore: 4.1 },
      }),
    );
    expect(phrase).toContain("replies: within normal variation");
    expect(phrase).toContain("bounces: HIGHER");
  });
});

describe("parseRepPerformanceToolUse", () => {
  it("reads a well-formed answer", () => {
    const parsed = parseRepPerformanceToolUse(
      toolUse({
        summary: "One mailbox is clearly behind the others.",
        findings: [VALID_FINDING],
        cautions: ["Six months of one client's sending is a small sample."],
      }),
    );

    expect(parsed?.findings).toHaveLength(1);
    expect(parsed?.findings[0].senderLabel).toBe("Bev — bev@acme.co.uk");
    expect(parsed?.findings[0].likelyCauses).toHaveLength(2);
  });

  it("DROPS a finding that names a sender and offers only one explanation", () => {
    // The rule the parser enforces rather than requests. A single confident
    // cause attached to a named person's mailbox reads as a diagnosis this
    // application has made, and the table cannot support one.
    const parsed = parseRepPerformanceToolUse(
      toolUse({
        summary: "Bev is behind.",
        findings: [{ ...VALID_FINDING, likelyCauses: [] }],
        cautions: [],
      }),
    );

    expect(parsed).not.toBeNull();
    expect(parsed?.findings).toHaveLength(0);
    // The summary survives: it was paid for, and it is still readable.
    expect(parsed?.summary).toBe("Bev is behind.");
  });

  it("keeps an empty findings list as a real answer rather than an error", () => {
    const parsed = parseRepPerformanceToolUse(
      toolUse({
        summary: "These senders are performing the same. Nothing to act on.",
        findings: [],
        cautions: [],
      }),
    );

    expect(parsed).not.toBeNull();
    expect(parsed?.findings).toHaveLength(0);
  });

  it("treats a missing summary as no answer at all", () => {
    expect(
      parseRepPerformanceToolUse(toolUse({ findings: [VALID_FINDING], cautions: [] })),
    ).toBeNull();
    expect(
      parseRepPerformanceToolUse(toolUse({ summary: "   ", findings: [], cautions: [] })),
    ).toBeNull();
  });

  it("drops an unattributed finding rather than printing a nameless accusation", () => {
    const parsed = parseRepPerformanceToolUse(
      toolUse({
        summary: "Something is off.",
        findings: [{ ...VALID_FINDING, senderLabel: "  " }],
        cautions: [],
      }),
    );
    expect(parsed?.findings).toHaveLength(0);
  });

  it("caps the number of findings", () => {
    const parsed = parseRepPerformanceToolUse(
      toolUse({
        summary: "Many.",
        findings: Array.from({ length: MAX_FINDINGS + 4 }, () => VALID_FINDING),
        cautions: [],
      }),
    );
    expect(parsed?.findings).toHaveLength(MAX_FINDINGS);
  });

  it("returns null for prose, a wrong tool name, or nothing at all", () => {
    expect(parseRepPerformanceToolUse([{ type: "text", text: "I can't help." }])).toBeNull();
    expect(
      parseRepPerformanceToolUse([
        { type: "tool_use", name: "rate_the_reps", input: { summary: "x" } },
      ]),
    ).toBeNull();
    expect(parseRepPerformanceToolUse(null)).toBeNull();
    expect(parseRepPerformanceToolUse("nope")).toBeNull();
  });
});
