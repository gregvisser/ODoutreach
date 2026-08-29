import { describe, expect, it, vi } from "vitest";

import {
  buildCampaignReviewInput,
  CAMPAIGN_REVIEW_SYSTEM_PROMPT,
  CAMPAIGN_REVIEW_TOOL,
  parseCampaignReviewToolUse,
  type CampaignReviewInput,
} from "@/lib/ai/campaign-review";

import { callAnthropicMessages } from "./anthropic-messages";

/**
 * Round-trip: the REAL request builder, through the REAL HTTP layer, into the
 * REAL parser. Only `fetch` is faked.
 *
 * WHY THIS EXISTS, given the feature is already covered twice over.
 *
 * `review-campaign.test.ts` mocks `callAnthropicMessages`, and
 * `campaign-review.test.ts` hands the parser a hand-written block. Both are
 * useful and both share one blind spot: nothing asserts that the tool schema we
 * SEND and the shape we PARSE are the same agreement. A rename on one side
 * would leave every one of those tests green and the feature dead in
 * production — which is this project's most-repeated defect, six times this
 * week: built, wired, reporting success, never firing.
 *
 * This cannot call the real API (there is no key, and a test that spent money
 * would be a bad test). What it can do is prove every layer we own is
 * consistent, so the only untested link left is Anthropic's own.
 */

const CAMPAIGN: CampaignReviewInput = {
  clientName: "Acme Safety",
  industry: "Health and safety consulting",
  targetJobTitles: ["Operations Director"],
  sequenceName: "Q3 manufacturing push",
  steps: [
    {
      position: 0,
      categoryLabel: "Introduction email",
      absoluteDay: 1,
      subject: "Quick question about {{company_name}}",
      body: "Hello {{first_name}}, we audit factory floors.",
    },
    {
      position: 1,
      categoryLabel: "Follow-up 1",
      absoluteDay: 4,
      subject: "Following up",
      body: "Just checking you saw this.",
    },
  ],
};

/** A response shaped exactly as the Messages API returns a forced tool call. */
function anthropicResponse(input: unknown) {
  return {
    ok: true,
    json: async () => ({
      id: "msg_01",
      type: "message",
      role: "assistant",
      model: "claude-haiku-4-5-20251001",
      stop_reason: "tool_use",
      content: [
        { type: "tool_use", id: "toolu_01", name: CAMPAIGN_REVIEW_TOOL.name, input },
      ],
      usage: { input_tokens: 1_431, output_tokens: 288 },
    }),
  } as unknown as Response;
}

describe("campaign review round-trip", () => {
  it("sends the forced tool and parses the answer it gets back", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      anthropicResponse({
        score: 68,
        summary: "Specific and short, but the follow-up adds nothing new.",
        findings: [
          {
            severity: "high",
            area: "sequence_flow",
            finding: "Email 2 repeats email 1 without adding anything.",
            suggestion: "Give email 2 a fact or a result email 1 did not use.",
          },
        ],
      }),
    );

    const response = await callAnthropicMessages({
      apiKey: "sk-ant-test",
      model: "claude-haiku-4-5-20251001",
      system: CAMPAIGN_REVIEW_SYSTEM_PROMPT,
      userText: buildCampaignReviewInput(CAMPAIGN),
      maxTokens: 2_000,
      tool: CAMPAIGN_REVIEW_TOOL,
      fetchImpl,
    });

    // The request actually carried our tool, and forced its use.
    const body = JSON.parse(
      (fetchImpl.mock.calls[0][1] as { body: string }).body,
    ) as {
      tools: Array<{ name: string }>;
      tool_choice: { type: string; name: string };
      system: string;
      messages: Array<{ content: string }>;
    };
    expect(body.tools[0].name).toBe(CAMPAIGN_REVIEW_TOOL.name);
    expect(body.tool_choice).toEqual({
      type: "tool",
      name: CAMPAIGN_REVIEW_TOOL.name,
    });
    expect(body.system.toLowerCase()).toContain("untrusted");
    expect(body.messages[0].content).toContain("<campaign>");
    expect(body.messages[0].content).toContain("Quick question about");

    // The tokens that become the bill survived the trip.
    expect(response.inputTokens).toBe(1_431);
    expect(response.outputTokens).toBe(288);

    // And the parser we ship reads what the API we ship talking to sent back.
    const parsed = parseCampaignReviewToolUse(response.content);
    expect(parsed).not.toBeNull();
    expect(parsed?.score).toBe(68);
    expect(parsed?.findings).toHaveLength(1);
    expect(parsed?.findings[0].area).toBe("sequence_flow");
    expect(parsed?.findings[0].severity).toBe("high");
  });

  it("would notice if the tool name drifted between sender and parser", () => {
    // The failure this file exists to catch, made explicit: a response naming a
    // different tool parses to nothing, so a rename on one side only is caught
    // here rather than in production.
    const stale = [
      { type: "tool_use", name: "record_campaign_critique", input: { score: 80 } },
    ];
    expect(parseCampaignReviewToolUse(stale)).toBeNull();
  });

  it("reads a real refusal turn as no review rather than as a zero score", async () => {
    // A model that declines answers in prose with no tool block. Scoring that
    // as 0/100 would put "Weak — rewrite before sending" on a campaign nobody
    // actually reviewed.
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: "I can't help with that." }],
        usage: { input_tokens: 900, output_tokens: 12 },
      }),
    } as unknown as Response);

    const response = await callAnthropicMessages({
      apiKey: "sk-ant-test",
      model: "claude-haiku-4-5-20251001",
      system: CAMPAIGN_REVIEW_SYSTEM_PROMPT,
      userText: buildCampaignReviewInput(CAMPAIGN),
      maxTokens: 2_000,
      tool: CAMPAIGN_REVIEW_TOOL,
      fetchImpl,
    });

    expect(parseCampaignReviewToolUse(response.content)).toBeNull();
    // Still billable: the tokens were spent whatever the model decided.
    expect(response.inputTokens).toBe(900);
  });
});
