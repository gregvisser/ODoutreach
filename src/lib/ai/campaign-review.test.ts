import { describe, expect, it } from "vitest";

import {
  buildCampaignReviewInput,
  CAMPAIGN_REVIEW_AREAS,
  CAMPAIGN_REVIEW_PROMPT_VERSION,
  CAMPAIGN_REVIEW_SYSTEM_PROMPT,
  CAMPAIGN_REVIEW_TOOL,
  MAX_FINDINGS,
  MAX_SUGGESTION_CHARS,
  MAX_SUMMARY_CHARS,
  parseCampaignReviewToolUse,
  scoreBand,
  type CampaignReviewInput,
} from "./campaign-review";

/**
 * Campaign quality score and critique — the pure half.
 *
 * The tests are grouped around the two things that can actually hurt somebody:
 * a model opinion being mistaken for permission to send, and a "review" feature
 * quietly becoming a second, unguarded way to author email copy.
 */

function toolUse(input: unknown): unknown {
  return [{ type: "tool_use", name: CAMPAIGN_REVIEW_TOOL.name, input }];
}

const GOOD_INPUT = {
  score: 72,
  summary: "Solid, specific, and short. The third email repeats the second.",
  findings: [
    {
      severity: "medium",
      area: "sequence_flow",
      finding: "Email 3 makes the same argument as email 2.",
      suggestion: "Give email 3 a different angle.",
    },
  ],
};

const CAMPAIGN: CampaignReviewInput = {
  clientName: "Acme Safety",
  industry: "Health and safety consulting",
  targetJobTitles: ["Operations Director"],
  sequenceName: "Q3 manufacturing push",
  steps: [
    {
      position: 0,
      categoryLabel: "Introduction",
      absoluteDay: 1,
      subject: "Quick question about {{company_name}}",
      body: "Hello {{first_name}}, ...",
    },
  ],
};

describe("parseCampaignReviewToolUse", () => {
  it("reads a well-formed review", () => {
    const parsed = parseCampaignReviewToolUse(toolUse(GOOD_INPUT));
    expect(parsed).not.toBeNull();
    expect(parsed?.score).toBe(72);
    expect(parsed?.summary).toContain("Solid");
    expect(parsed?.findings).toHaveLength(1);
    expect(parsed?.findings[0].severity).toBe("medium");
    expect(parsed?.findings[0].area).toBe("sequence_flow");
  });

  it("returns null for a non-array content block", () => {
    expect(parseCampaignReviewToolUse("nope")).toBeNull();
    expect(parseCampaignReviewToolUse(null)).toBeNull();
  });

  it("returns null for a tool call by another name", () => {
    expect(
      parseCampaignReviewToolUse([
        { type: "tool_use", name: "something_else", input: GOOD_INPUT },
      ]),
    ).toBeNull();
  });

  it("returns null when the model answered in prose instead of the tool", () => {
    expect(
      parseCampaignReviewToolUse([{ type: "text", text: "I think it is fine." }]),
    ).toBeNull();
  });

  it("returns null when the score is missing or not a number", () => {
    expect(
      parseCampaignReviewToolUse(toolUse({ ...GOOD_INPUT, score: undefined })),
    ).toBeNull();
    expect(
      parseCampaignReviewToolUse(toolUse({ ...GOOD_INPUT, score: "high" })),
    ).toBeNull();
    expect(
      parseCampaignReviewToolUse(toolUse({ ...GOOD_INPUT, score: Number.NaN })),
    ).toBeNull();
  });

  it("returns null when the summary is missing or empty", () => {
    expect(
      parseCampaignReviewToolUse(toolUse({ ...GOOD_INPUT, summary: "   " })),
    ).toBeNull();
    expect(
      parseCampaignReviewToolUse(toolUse({ ...GOOD_INPUT, summary: 5 })),
    ).toBeNull();
  });

  it("accepts a review with no findings at all", () => {
    const parsed = parseCampaignReviewToolUse(
      toolUse({ ...GOOD_INPUT, findings: [] }),
    );
    expect(parsed).not.toBeNull();
    expect(parsed?.findings).toHaveLength(0);
  });

  it("returns null when findings is not an array", () => {
    expect(
      parseCampaignReviewToolUse(toolUse({ ...GOOD_INPUT, findings: "none" })),
    ).toBeNull();
  });

  /**
   * A score is rendered as "NN / 100". A model that returns 900, or -4, or 72.6
   * must not reach a screen as written — the number is the headline of the whole
   * feature and a nonsensical one destroys trust in the rest of the critique.
   */
  it("clamps and rounds the score rather than trusting the model", () => {
    expect(parseCampaignReviewToolUse(toolUse({ ...GOOD_INPUT, score: 900 }))?.score).toBe(100);
    expect(parseCampaignReviewToolUse(toolUse({ ...GOOD_INPUT, score: -4 }))?.score).toBe(0);
    expect(parseCampaignReviewToolUse(toolUse({ ...GOOD_INPUT, score: 72.6 }))?.score).toBe(73);
  });

  it("drops findings that are not objects, keeping the usable ones", () => {
    const parsed = parseCampaignReviewToolUse(
      toolUse({
        ...GOOD_INPUT,
        findings: [GOOD_INPUT.findings[0], "junk", null, GOOD_INPUT.findings[0]],
      }),
    );
    expect(parsed?.findings).toHaveLength(2);
  });

  it("coerces an unrecognised severity to medium rather than dropping the finding", () => {
    const parsed = parseCampaignReviewToolUse(
      toolUse({
        ...GOOD_INPUT,
        findings: [{ ...GOOD_INPUT.findings[0], severity: "catastrophic" }],
      }),
    );
    expect(parsed?.findings[0].severity).toBe("medium");
  });

  it("coerces an unrecognised area to other rather than dropping the finding", () => {
    const parsed = parseCampaignReviewToolUse(
      toolUse({
        ...GOOD_INPUT,
        findings: [{ ...GOOD_INPUT.findings[0], area: "vibes" }],
      }),
    );
    expect(parsed?.findings[0].area).toBe("other");
  });

  it("drops a finding with no finding text, since there is nothing to show", () => {
    const parsed = parseCampaignReviewToolUse(
      toolUse({
        ...GOOD_INPUT,
        findings: [{ ...GOOD_INPUT.findings[0], finding: "  " }],
      }),
    );
    expect(parsed?.findings).toHaveLength(0);
  });

  it("tolerates a finding with no suggestion", () => {
    const parsed = parseCampaignReviewToolUse(
      toolUse({
        ...GOOD_INPUT,
        findings: [{ ...GOOD_INPUT.findings[0], suggestion: undefined }],
      }),
    );
    expect(parsed?.findings).toHaveLength(1);
    expect(parsed?.findings[0].suggestion).toBe("");
  });

  it("caps the number of findings so one answer cannot flood the screen", () => {
    const many = Array.from({ length: MAX_FINDINGS + 20 }, () => GOOD_INPUT.findings[0]);
    const parsed = parseCampaignReviewToolUse(toolUse({ ...GOOD_INPUT, findings: many }));
    expect(parsed?.findings).toHaveLength(MAX_FINDINGS);
  });

  it("truncates an over-long summary rather than rejecting the paid answer", () => {
    const parsed = parseCampaignReviewToolUse(
      toolUse({ ...GOOD_INPUT, summary: "x".repeat(MAX_SUMMARY_CHARS + 500) }),
    );
    expect(parsed?.summary.length).toBeLessThanOrEqual(MAX_SUMMARY_CHARS);
  });

  /**
   * THE ONE THAT MATTERS MOST IN THIS FILE.
   *
   * A "suggestion" is meant to be an instruction to a person — "shorten the
   * subject line". It is NOT a replacement email. If the model can return whole
   * copy here, this review feature becomes a second, unguarded way to author
   * outreach text: one that never passes the placeholder allowlist, the
   * signature-token strip or the length caps that `sequence-drafting.ts`
   * enforces, and whose output a person can paste straight into a template.
   *
   * The cap is what makes that structurally impossible rather than merely
   * discouraged by the prompt.
   */
  it("truncates a suggestion, so a critique can never carry a whole email", () => {
    const wholeEmail = "Hello there. ".repeat(400);
    const parsed = parseCampaignReviewToolUse(
      toolUse({
        ...GOOD_INPUT,
        findings: [{ ...GOOD_INPUT.findings[0], suggestion: wholeEmail }],
      }),
    );
    expect(parsed?.findings[0].suggestion.length).toBeLessThanOrEqual(
      MAX_SUGGESTION_CHARS,
    );
    expect(MAX_SUGGESTION_CHARS).toBeLessThan(400);
  });
});

describe("the tool schema", () => {
  it("forces a single named tool call with a score, summary and findings", () => {
    const props = CAMPAIGN_REVIEW_TOOL.input_schema.properties as Record<string, unknown>;
    expect(Object.keys(props).sort()).toEqual(["findings", "score", "summary"]);
    expect(CAMPAIGN_REVIEW_TOOL.input_schema.required).toEqual(
      expect.arrayContaining(["score", "summary", "findings"]),
    );
  });

  /**
   * THE GUARDRAIL THIS CYCLE EXISTS TO PIN DOWN.
   *
   * The model scores COPY. It must have no way to express a verdict on whether
   * the campaign may be sent — no "approved", no "ready_to_launch", no
   * "safe_to_send". The moment such a field exists, some screen renders it, and
   * an operator reads a machine's opinion as clearance to mail strangers from a
   * real client's domain.
   *
   * Launch permission is decided by `evaluateSequenceLaunchReadiness`, which is
   * deterministic, offline, and knows nothing about this file.
   */
  it("gives the model no way to say a campaign may be sent", () => {
    const schema = JSON.stringify(CAMPAIGN_REVIEW_TOOL.input_schema).toLowerCase();
    for (const forbidden of [
      "approve",
      "approved",
      "launch",
      "ready_to_send",
      "safe_to_send",
      "can_send",
      "send_now",
    ]) {
      expect(schema).not.toContain(forbidden);
    }
  });

  it("has a suggestion field described as an instruction, not replacement copy", () => {
    const findings = (
      CAMPAIGN_REVIEW_TOOL.input_schema.properties as {
        findings: { items: { properties: { suggestion: { description: string } } } };
      }
    ).findings.items.properties.suggestion;
    expect(findings.description.toLowerCase()).toContain("do not");
  });

  it("constrains the areas the model may use", () => {
    expect(CAMPAIGN_REVIEW_AREAS).toContain("subject");
    expect(CAMPAIGN_REVIEW_AREAS).toContain("compliance");
    expect(CAMPAIGN_REVIEW_AREAS).toContain("other");
  });
});

describe("buildCampaignReviewInput", () => {
  it("fences the campaign so copy cannot be read as instructions", () => {
    const text = buildCampaignReviewInput(CAMPAIGN);
    expect(text).toContain("<campaign>");
    expect(text).toContain("</campaign>");
  });

  it("includes the client, the sequence and every email's subject and body", () => {
    const text = buildCampaignReviewInput(CAMPAIGN);
    expect(text).toContain("Acme Safety");
    expect(text).toContain("Q3 manufacturing push");
    expect(text).toContain("Quick question about {{company_name}}");
    expect(text).toContain("Hello {{first_name}}");
  });

  it("labels each email with its position and day so the model can judge the flow", () => {
    const text = buildCampaignReviewInput({
      ...CAMPAIGN,
      steps: [
        CAMPAIGN.steps[0],
        {
          position: 1,
          categoryLabel: "Follow-up 1",
          absoluteDay: 4,
          subject: "Following up",
          body: "Just checking.",
        },
      ],
    });
    expect(text).toContain("Follow-up 1");
    expect(text).toContain("day 4");
  });

  it("omits a day when the schedule is not known, rather than inventing one", () => {
    const text = buildCampaignReviewInput({
      ...CAMPAIGN,
      steps: [{ ...CAMPAIGN.steps[0], absoluteDay: null }],
    });
    expect(text).not.toContain("day null");
    expect(text).not.toContain("NaN");
  });

  it("tells the model the campaign text is untrusted", () => {
    expect(CAMPAIGN_REVIEW_SYSTEM_PROMPT.toLowerCase()).toContain("untrusted");
  });

  it("carries a prompt version, so an old review is not read as a current one", () => {
    expect(CAMPAIGN_REVIEW_PROMPT_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });
});

describe("scoreBand", () => {
  it("bands the score for the screen", () => {
    expect(scoreBand(95).id).toBe("strong");
    expect(scoreBand(75).id).toBe("solid");
    expect(scoreBand(55).id).toBe("needs_work");
    expect(scoreBand(20).id).toBe("poor");
  });

  it("gives every band a plain-English label", () => {
    for (const score of [0, 49, 50, 69, 70, 84, 85, 100]) {
      expect(scoreBand(score).label.length).toBeGreaterThan(0);
    }
  });

  /**
   * No band may read as permission. "Strong" describes the writing; "approved",
   * "ready" or "safe to send" would describe the send decision, which this
   * feature does not make.
   */
  it("never labels a band as permission to send", () => {
    for (const score of [0, 25, 50, 75, 100]) {
      const label = scoreBand(score).label.toLowerCase();
      expect(label).not.toContain("approve");
      expect(label).not.toContain("ready to send");
      expect(label).not.toContain("safe");
    }
  });
});
