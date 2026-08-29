import { describe, expect, it, vi } from "vitest";

import {
  buildTitleMessageInput,
  parseTitleMessageToolUse,
  TITLE_MESSAGE_SYSTEM_PROMPT,
  TITLE_MESSAGE_TOOL,
} from "@/lib/ai/title-message";
import {
  assessTitleMessageEvidence,
  TITLE_MESSAGE_LOOKBACK_DAYS,
  TITLE_MESSAGE_MATURITY_DAYS,
  type MessageIdentity,
  type TitleMessageOutcome,
} from "@/lib/ai/title-message-evidence";

import { callAnthropicMessages } from "./anthropic-messages";

/**
 * Round-trip: the REAL job-title grouping, the REAL evidence builder, the REAL
 * multiplicity-adjusted significance test, the REAL request builder, the REAL
 * HTTP layer and the REAL parser. Only `fetch` is faked.
 *
 * WHY THIS EXISTS, given the feature is already covered four times over.
 *
 * `advise-title-messages.test.ts` mocks `callAnthropicMessages`;
 * `title-message.test.ts` hands the parser a hand-written block;
 * `title-message-evidence.test.ts` and `title-family.test.ts` never go near the
 * model. All four are useful and all four share one blind spot: nothing asserts
 * that the tool schema we SEND and the shape we PARSE are the same agreement, or
 * that the verdict our arithmetic reached actually reaches the model. A drift
 * anywhere on that path would leave every other test green and the feature dead
 * in production — this project's most-repeated defect, six times in one week:
 * built, wired, reporting success, never firing.
 *
 * This cannot call the real API (there is no key, and a test that spent money
 * would be a bad test). What it can do is prove every layer we own agrees, so
 * the only untested link left is Anthropic's own.
 */

const MESSAGES: MessageIdentity[] = [
  { sequenceId: "seq-a", label: "Cost-saving campaign" },
  { sequenceId: "seq-b", label: "Compliance campaign" },
];

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
        { type: "tool_use", id: "toolu_01", name: TITLE_MESSAGE_TOOL.name, input },
      ],
      usage: { input_tokens: 1_512, output_tokens: 331 },
    }),
  } as unknown as Response;
}

async function send(userText: string, fetchImpl: ReturnType<typeof vi.fn>) {
  return callAnthropicMessages({
    apiKey: "sk-ant-test",
    model: "claude-haiku-4-5-20251001",
    system: TITLE_MESSAGE_SYSTEM_PROMPT,
    userText,
    maxTokens: 2_000,
    tool: TITLE_MESSAGE_TOOL,
    fetchImpl,
  });
}

describe("message-fit-by-job-title round-trip", () => {
  it("groups the titles, carries our verdict, and parses what comes back", async () => {
    // Free-text titles in the spellings a real CSV holds. The grouping is part
    // of what is under test: nothing downstream sees the raw strings.
    const verdict = assessTitleMessageEvidence(
      [
        ...cell({
          title: "Operations Manager",
          sequenceId: "seq-a",
          enrollments: 400,
          replied: 80,
        }),
        ...cell({
          title: "Head of Ops",
          sequenceId: "seq-a",
          enrollments: 400,
          replied: 80,
        }),
        ...cell({
          title: "Operations Director",
          sequenceId: "seq-b",
          enrollments: 800,
          replied: 24,
        }),
        // A title we deliberately refuse to group, so coverage is exercised too.
        ...cell({ title: "Director", sequenceId: "seq-a", enrollments: 200, replied: 20 }),
      ],
      MESSAGES,
    );
    expect(verdict.sufficient).toBe(true);
    if (!verdict.sufficient) throw new Error("unreachable");
    expect(verdict.anyDistinguishable).toBe(true);
    // Three spellings of one job landed in one audience.
    expect(verdict.families).toHaveLength(1);
    expect(verdict.families[0].label).toBe("Operations");
    expect(verdict.families[0].enrollments).toBe(1_600);

    const fetchImpl = vi.fn().mockResolvedValue(
      anthropicResponse({
        summary:
          "The cost-saving campaign got far more replies from operations people, but the two campaigns were aimed at lists built separately.",
        findings: [
          {
            audienceLabel: "Operations",
            messageLabel: "Cost-saving campaign",
            observation:
              "20% of its 800 operations contacts replied, against 3% for the other campaign.",
            couldExplainIt: [
              "The two campaigns were aimed at differently-built lists of operations people.",
              "The mailboxes used may have had different deliverability at the time.",
            ],
            checkFirst: "How each campaign's contact list was sourced and filtered.",
          },
        ],
        cautions: [
          "Nobody was randomised between the two campaigns.",
          "Only replies the matcher could link to a send are counted.",
        ],
      }),
    );

    const response = await send(
      buildTitleMessageInput({
        clientName: "Acme Safety",
        industry: "Health and safety consulting",
        families: verdict.families,
        coverage: verdict.coverage,
        totalReplied: verdict.totalReplied,
        totalPositive: verdict.totalPositive,
        lookbackDays: TITLE_MESSAGE_LOOKBACK_DAYS,
        maturityDays: TITLE_MESSAGE_MATURITY_DAYS,
        comparisonCount: verdict.comparisonCount,
        anyDistinguishable: verdict.anyDistinguishable,
      }),
      fetchImpl,
    );

    const body = JSON.parse(
      (fetchImpl.mock.calls[0][1] as { body: string }).body,
    ) as {
      tools: Array<{ name: string }>;
      tool_choice: { type: string; name: string };
      system: string;
      messages: Array<{ content: string }>;
    };

    // The request actually carried our tool, and forced its use.
    expect(body.tools[0].name).toBe(TITLE_MESSAGE_TOOL.name);
    expect(body.tool_choice).toEqual({
      type: "tool",
      name: TITLE_MESSAGE_TOOL.name,
    });

    // The counts the model is asked to read are OUR counts, over OUR audience...
    const prompt = body.messages[0].content;
    expect(prompt).toContain("Operations — 1600 people");
    expect(prompt).toContain("Cost-saving campaign | 800 people | 160 replied (20%)");

    // ...and so is the significance verdict, which is the thing that stops it
    // explaining noise. If this line ever stopped being built into the prompt,
    // every other test in this feature would stay green.
    expect(prompt).toContain(
      "MORE replies than the other campaigns to this audience, by more than chance",
    );

    // The coverage the answer must not generalise past travelled too.
    expect(prompt).toContain("whose title could not be grouped");
    // And the fact that the bar moved with the size of the table.
    expect(prompt).toContain("comparisons were made");

    // The facts that stop it inventing a reason travelled in the system turn.
    expect(body.system).toContain("NOBODY WAS RANDOMISED");
    expect(body.system).toContain("have not seen the emails");

    // The tokens that become the bill survived the trip.
    expect(response.inputTokens).toBe(1_512);
    expect(response.outputTokens).toBe(331);

    // The parser we ship reads what the API we ship talking to sent back, and
    // the labels it echoes back match a row in our table — which is exactly what
    // the server's drop-guard matches on. A drift in either label would silently
    // drop every finding in production.
    const parsed = parseTitleMessageToolUse(response.content);
    expect(parsed?.findings).toHaveLength(1);
    const finding = parsed?.findings[0];
    expect(verdict.families.map((f) => f.label)).toContain(finding?.audienceLabel);
    expect(
      verdict.families[0].messages.map((m) => m.label),
    ).toContain(finding?.messageLabel);
  });

  it("tells the model plainly when there is nothing to explain", async () => {
    // The common case, and the one this feature is built to get right. Two
    // campaigns four replies apart look unequal on screen and are not.
    const verdict = assessTitleMessageEvidence(
      [
        ...cell({
          title: "Operations Manager",
          sequenceId: "seq-a",
          enrollments: 500,
          replied: 30,
        }),
        ...cell({
          title: "Operations Manager",
          sequenceId: "seq-b",
          enrollments: 500,
          replied: 26,
        }),
      ],
      MESSAGES,
    );
    if (!verdict.sufficient) throw new Error("unreachable");
    expect(verdict.anyDistinguishable).toBe(false);

    const fetchImpl = vi.fn().mockResolvedValue(
      anthropicResponse({
        summary:
          "Neither campaign is doing better than the other with any audience. There is nothing to act on.",
        findings: [],
        cautions: ["Six months is a short history."],
      }),
    );

    await send(
      buildTitleMessageInput({
        clientName: "Acme Safety",
        industry: null,
        families: verdict.families,
        coverage: verdict.coverage,
        totalReplied: verdict.totalReplied,
        totalPositive: verdict.totalPositive,
        lookbackDays: TITLE_MESSAGE_LOOKBACK_DAYS,
        maturityDays: TITLE_MESSAGE_MATURITY_DAYS,
        comparisonCount: verdict.comparisonCount,
        anyDistinguishable: verdict.anyDistinguishable,
      }),
      fetchImpl,
    );

    const body = JSON.parse(
      (fetchImpl.mock.calls[0][1] as { body: string }).body,
    ) as { messages: Array<{ content: string }> };

    expect(body.messages[0].content).toContain(
      "NO campaign beat another with ANY audience by more than chance",
    );
    expect(body.messages[0].content).toContain("within normal variation");
  });
});
