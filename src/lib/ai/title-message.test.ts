import { describe, expect, it } from "vitest";

import {
  buildTitleMessageInput,
  cellVerdictPhrase,
  MAX_ALTERNATIVES,
  MAX_CAUTIONS,
  MAX_FINDINGS,
  MAX_OBSERVATION_CHARS,
  MAX_SUMMARY_CHARS,
  parseTitleMessageToolUse,
  TITLE_MESSAGE_SYSTEM_PROMPT,
  TITLE_MESSAGE_TOOL,
  type TitleMessageInput,
} from "./title-message";
import type { TitleFamilyStat } from "./title-message-evidence";

const FAMILIES: TitleFamilyStat[] = [
  {
    family: "OPERATIONS",
    label: "Operations",
    enrollments: 1_600,
    replied: 184,
    positive: 60,
    replyRatePercent: 12,
    messages: [
      {
        sequenceId: "seq-a",
        label: "Cost-saving campaign",
        enrollments: 800,
        replied: 160,
        positive: 53,
        replyRatePercent: 20,
        positiveRatePercent: 7,
        comparison: { kind: "above", zScore: 9.1 },
      },
      {
        sequenceId: "seq-b",
        label: "Compliance campaign",
        enrollments: 800,
        replied: 24,
        positive: 7,
        replyRatePercent: 3,
        positiveRatePercent: 1,
        comparison: { kind: "below", zScore: -9.1 },
      },
    ],
    anyDistinguishable: true,
  },
];

const INPUT: TitleMessageInput = {
  clientName: "Acme Safety",
  industry: "Health and safety",
  families: FAMILIES,
  coverage: {
    totalEnrollments: 2_400,
    missingTitle: 400,
    ungrouped: 300,
    tooThinToCompare: 100,
    compared: 1_600,
    comparedPercent: 67,
  },
  totalReplied: 184,
  totalPositive: 60,
  lookbackDays: 180,
  maturityDays: 35,
  comparisonCount: 2,
  anyDistinguishable: true,
};

function toolUse(input: unknown) {
  return [{ type: "tool_use", name: TITLE_MESSAGE_TOOL.name, input }];
}

const VALID_FINDING = {
  audienceLabel: "Operations",
  messageLabel: "Cost-saving campaign",
  observation: "20% of 800 replied, against 3% for the other campaign.",
  couldExplainIt: ["The two lists were built differently."],
  checkFirst: "How each list was sourced.",
};

describe("TITLE_MESSAGE_SYSTEM_PROMPT", () => {
  /**
   * The prompt's job is to stop the model asserting things this data cannot
   * support. Each of these is a specific wrong answer it would otherwise give
   * fluently, so each is stated in the prompt as fact.
   */
  it("states the facts the model would otherwise get confidently wrong", () => {
    expect(TITLE_MESSAGE_SYSTEM_PROMPT).toMatch(/NOBODY WAS RANDOMISED/);
    expect(TITLE_MESSAGE_SYSTEM_PROMPT).toMatch(/have not seen the emails/i);
    expect(TITLE_MESSAGE_SYSTEM_PROMPT).toMatch(/within normal variation/i);
    expect(TITLE_MESSAGE_SYSTEM_PROMPT).toMatch(/deliverability/i);
    // It must not invite copy, which is one copy-paste from a real send.
    expect(TITLE_MESSAGE_SYSTEM_PROMPT).toMatch(
      /not write, suggest or quote email copy/i,
    );
  });
});

describe("TITLE_MESSAGE_TOOL", () => {
  /**
   * THE STRUCTURAL GUARDRAIL, asserted against the schema itself. A field the
   * model could write copy or an instruction into would arrive with the
   * authority of a statistic — see the file header. The absence is the control,
   * so the absence is what is tested.
   */
  it("offers no field for copy, a subject line, or a change to a campaign", () => {
    const schema = JSON.stringify(TITLE_MESSAGE_TOOL.input_schema);
    for (const forbidden of [
      "subject",
      "subjectLine",
      "suggestedCopy",
      "draft",
      "rewrite",
      "recommendation",
      "recommendedAction",
      "score",
      "rating",
      "rank",
    ]) {
      expect(schema).not.toContain(`"${forbidden}"`);
    }
  });

  it("requires the alternatives that keep a finding honest", () => {
    const finding = TITLE_MESSAGE_TOOL.input_schema.properties.findings.items;
    expect(finding.required).toContain("couldExplainIt");
    expect(finding.required).toContain("audienceLabel");
    expect(finding.required).toContain("messageLabel");
  });
});

describe("buildTitleMessageInput", () => {
  it("puts every count and our verdict in front of the model", () => {
    const text = buildTitleMessageInput(INPUT);
    expect(text).toContain("Acme Safety");
    expect(text).toContain("Operations");
    expect(text).toContain("Cost-saving campaign");
    expect(text).toContain("800 people");
    expect(text).toContain("160 replied (20%)");
    expect(text).toContain(
      "MORE replies than the other campaigns to this audience, by more than chance",
    );
    expect(text).toContain(
      "FEWER replies than the other campaigns to this audience, by more than chance",
    );
  });

  it("tells the model how much of the outreach it is NOT seeing", () => {
    const text = buildTitleMessageInput(INPUT);
    expect(text).toContain("1600 of them (67%)");
    expect(text).toContain("400 with no job title recorded");
    expect(text).toContain("300 whose title could not be grouped");
  });

  it("says the recent weeks are excluded, so the model cannot read a trend", () => {
    const text = buildTitleMessageInput(INPUT);
    expect(text).toContain("35 days");
    expect(text).toMatch(/still being emailed/i);
  });

  it("says how many comparisons were made, since that moved the bar", () => {
    expect(buildTitleMessageInput(INPUT)).toContain("2 comparisons were made");
  });

  /**
   * When nothing is distinguishable the instruction must be unambiguous, because
   * "these are the same" is the answer most of the time and a model nudged
   * toward finding something will find something.
   */
  it("tells the model plainly when there is nothing to explain", () => {
    const text = buildTitleMessageInput({ ...INPUT, anyDistinguishable: false });
    expect(text).toContain("NO campaign beat another with ANY audience");
    expect(text).toMatch(/leave findings empty/i);
  });

  it("omits the industry line when the client has none", () => {
    expect(buildTitleMessageInput({ ...INPUT, industry: null })).not.toContain(
      "Industry:",
    );
    expect(buildTitleMessageInput({ ...INPUT, industry: "  " })).not.toContain(
      "Industry:",
    );
  });
});

describe("cellVerdictPhrase", () => {
  it("says 'within normal variation' for a gap inside chance", () => {
    expect(cellVerdictPhrase({ kind: "indistinguishable" })).toBe(
      "within normal variation",
    );
  });
});

describe("parseTitleMessageToolUse", () => {
  it("reads a well-formed answer", () => {
    const parsed = parseTitleMessageToolUse(
      toolUse({
        summary: "The cost-saving campaign did better with operations people.",
        findings: [VALID_FINDING],
        cautions: ["Nobody was randomised."],
      }),
    );

    expect(parsed).not.toBeNull();
    expect(parsed?.findings).toHaveLength(1);
    expect(parsed?.findings[0].audienceLabel).toBe("Operations");
    expect(parsed?.cautions).toEqual(["Nobody was randomised."]);
  });

  it("accepts an empty findings list as the valid answer it usually is", () => {
    const parsed = parseTitleMessageToolUse(
      toolUse({
        summary: "No campaign is ahead of another with any audience.",
        findings: [],
        cautions: [],
      }),
    );
    expect(parsed).not.toBeNull();
    expect(parsed?.findings).toEqual([]);
  });

  it("refuses anything that is not this tool's answer", () => {
    expect(parseTitleMessageToolUse(null)).toBeNull();
    expect(parseTitleMessageToolUse("nope")).toBeNull();
    expect(parseTitleMessageToolUse([])).toBeNull();
    expect(parseTitleMessageToolUse([{ type: "text", text: "hello" }])).toBeNull();
    expect(
      parseTitleMessageToolUse([
        { type: "tool_use", name: "some_other_tool", input: { summary: "x" } },
      ]),
    ).toBeNull();
  });

  it("refuses an answer with no summary, because the summary IS the answer", () => {
    expect(parseTitleMessageToolUse(toolUse({ findings: [], cautions: [] }))).toBeNull();
    expect(
      parseTitleMessageToolUse(toolUse({ summary: "   ", findings: [], cautions: [] })),
    ).toBeNull();
  });

  /**
   * THE ONE RULE THE PARSER ENFORCES RATHER THAN REQUESTS. Nobody was
   * randomised, so a finding offering a single confident cause is never
   * warranted by this table. It is dropped rather than shown.
   */
  it("drops a finding that offers no alternative explanation", () => {
    const parsed = parseTitleMessageToolUse(
      toolUse({
        summary: "A summary.",
        findings: [
          { ...VALID_FINDING, couldExplainIt: [] },
          { ...VALID_FINDING, couldExplainIt: ["   ", 7] },
          VALID_FINDING,
        ],
        cautions: [],
      }),
    );
    expect(parsed?.findings).toHaveLength(1);
  });

  it("drops a finding that cannot be checked against the table", () => {
    const parsed = parseTitleMessageToolUse(
      toolUse({
        summary: "A summary.",
        findings: [
          { ...VALID_FINDING, audienceLabel: "" },
          { ...VALID_FINDING, messageLabel: "   " },
          { ...VALID_FINDING, observation: "" },
          "not an object",
          null,
          VALID_FINDING,
        ],
        cautions: [],
      }),
    );
    expect(parsed?.findings).toHaveLength(1);
  });

  it("caps every list and every string it stores", () => {
    const long = "x".repeat(MAX_OBSERVATION_CHARS + 500);
    const parsed = parseTitleMessageToolUse(
      toolUse({
        summary: "y".repeat(MAX_SUMMARY_CHARS + 500),
        findings: Array.from({ length: MAX_FINDINGS + 5 }, () => ({
          ...VALID_FINDING,
          observation: long,
          couldExplainIt: Array.from({ length: MAX_ALTERNATIVES + 5 }, () => long),
        })),
        cautions: Array.from({ length: MAX_CAUTIONS + 5 }, () => long),
      }),
    );

    expect(parsed?.summary).toHaveLength(MAX_SUMMARY_CHARS);
    expect(parsed?.findings).toHaveLength(MAX_FINDINGS);
    expect(parsed?.findings[0].observation).toHaveLength(MAX_OBSERVATION_CHARS);
    expect(parsed?.findings[0].couldExplainIt).toHaveLength(MAX_ALTERNATIVES);
    expect(parsed?.cautions).toHaveLength(MAX_CAUTIONS);
  });

  it("tolerates a missing checkFirst rather than losing the whole finding", () => {
    const withoutCheck: Record<string, unknown> = { ...VALID_FINDING };
    delete withoutCheck.checkFirst;

    const parsed = parseTitleMessageToolUse(
      toolUse({ summary: "A summary.", findings: [withoutCheck], cautions: [] }),
    );
    expect(parsed?.findings).toHaveLength(1);
    expect(parsed?.findings[0].checkFirst).toBe("");
  });
});
