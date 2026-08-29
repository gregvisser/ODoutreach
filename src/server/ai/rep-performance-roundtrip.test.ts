import { describe, expect, it, vi } from "vitest";

import {
  buildRepPerformanceInput,
  parseRepPerformanceToolUse,
  REP_PERFORMANCE_SYSTEM_PROMPT,
  REP_PERFORMANCE_TOOL,
} from "@/lib/ai/rep-performance";
import {
  assessRepEvidence,
  type RepIdentity,
  type RepSendOutcome,
} from "@/lib/ai/rep-performance-evidence";

import { callAnthropicMessages } from "./anthropic-messages";

/**
 * Round-trip: the REAL evidence builder, the REAL significance test, the REAL
 * request builder, the REAL HTTP layer and the REAL parser. Only `fetch` is
 * faked.
 *
 * WHY THIS EXISTS, given the feature is already covered three times over.
 *
 * `explain-rep-performance.test.ts` mocks `callAnthropicMessages`;
 * `rep-performance.test.ts` hands the parser a hand-written block; and
 * `rep-performance-evidence.test.ts` never goes near the model. All three are
 * useful and all three share one blind spot: nothing asserts that the tool
 * schema we SEND and the shape we PARSE are the same agreement, or that the
 * verdict our arithmetic reached actually reaches the model. A drift anywhere on
 * that path would leave every other test green and the feature dead in
 * production — this project's most-repeated defect, six times in one week:
 * built, wired, reporting success, never firing.
 *
 * This cannot call the real API (there is no key, and a test that spent money
 * would be a bad test). What it can do is prove every layer we own agrees, so
 * the only untested link left is Anthropic's own.
 */

const IDENTITIES: RepIdentity[] = [
  { mailboxIdentityId: "mbx-a", label: "Alex Poole — alex@acme.co.uk" },
  { mailboxIdentityId: "mbx-b", label: "Bev Nair — bev@acme.co.uk" },
];

function history(
  spec: readonly { id: string; sent: number; replied: number; bounced?: number }[],
): RepSendOutcome[] {
  const rows: RepSendOutcome[] = [];
  for (const rep of spec) {
    for (let i = 0; i < rep.sent; i += 1) {
      rows.push({
        mailboxIdentityId: rep.id,
        replied: i < rep.replied,
        positive: i < Math.floor(rep.replied / 3),
        bounced: i >= rep.sent - (rep.bounced ?? 0),
      });
    }
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
        { type: "tool_use", id: "toolu_01", name: REP_PERFORMANCE_TOOL.name, input },
      ],
      usage: { input_tokens: 1_310, output_tokens: 284 },
    }),
  } as unknown as Response;
}

async function send(userText: string, fetchImpl: ReturnType<typeof vi.fn>) {
  return callAnthropicMessages({
    apiKey: "sk-ant-test",
    model: "claude-haiku-4-5-20251001",
    system: REP_PERFORMANCE_SYSTEM_PROMPT,
    userText,
    maxTokens: 2_000,
    tool: REP_PERFORMANCE_TOOL,
    fetchImpl,
  });
}

describe("sender comparison round-trip", () => {
  it("counts the history, carries our verdict, and parses what comes back", async () => {
    const verdict = assessRepEvidence(
      history([
        { id: "mbx-a", sent: 500, replied: 60, bounced: 5 },
        { id: "mbx-b", sent: 500, replied: 10, bounced: 90 },
      ]),
      IDENTITIES,
    );
    expect(verdict.sufficient).toBe(true);
    if (!verdict.sufficient) throw new Error("unreachable");
    expect(verdict.anyDistinguishable).toBe(true);

    const fetchImpl = vi.fn().mockResolvedValue(
      anthropicResponse({
        summary: "One mailbox is clearly behind and is bouncing heavily.",
        findings: [
          {
            senderLabel: "Bev Nair — bev@acme.co.uk",
            observation: "2% replies against 12%, and 18% of its mail bounced.",
            likelyCauses: [
              "The sending domain may be failing authentication.",
              "The mailbox may be in a reputation hole.",
            ],
            checkFirst: "Check SPF, DKIM and DMARC on that mailbox's domain.",
          },
        ],
        cautions: ["Only replies the matcher could link to a send are counted."],
      }),
    );

    const response = await send(
      buildRepPerformanceInput({
        clientName: "Acme Safety",
        industry: "Health and safety consulting",
        reps: verdict.reps,
        totalSent: verdict.totalSent,
        totalReplied: verdict.totalReplied,
        totalPositive: verdict.totalPositive,
        lookbackDays: 180,
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
    expect(body.tools[0].name).toBe(REP_PERFORMANCE_TOOL.name);
    expect(body.tool_choice).toEqual({
      type: "tool",
      name: REP_PERFORMANCE_TOOL.name,
    });

    // The counts the model is asked to read are OUR counts...
    expect(body.messages[0].content).toContain(
      "Alex Poole — alex@acme.co.uk | sent 500 | replies 60 (12%)",
    );
    // ...and so is the significance verdict, which is the thing that stops it
    // explaining noise. If this line ever stopped being built into the prompt,
    // every other test in this feature would stay green.
    expect(body.messages[0].content).toContain(
      "FEWER than the others by more than chance",
    );
    expect(body.messages[0].content).toContain("bounces: HIGHER");

    // The four facts that stop it blaming the writing travelled too.
    expect(body.system).toContain("THE SAME WORDS");
    expect(body.system).toContain("not appraising staff");

    // The tokens that become the bill survived the trip.
    expect(response.inputTokens).toBe(1_310);
    expect(response.outputTokens).toBe(284);

    // The parser we ship reads what the API we ship talking to sent back, and
    // the label it echoes back matches a row in our table — which is what the
    // server's drop-guard matches on.
    const parsed = parseRepPerformanceToolUse(response.content);
    expect(parsed?.findings).toHaveLength(1);
    expect(verdict.reps.map((r) => r.label)).toContain(
      parsed?.findings[0].senderLabel,
    );
  });

  it("tells the model plainly when there is nothing to explain", async () => {
    // The common case, and the one this feature is built to get right. Two
    // mailboxes five replies apart look unequal on screen and are not.
    const verdict = assessRepEvidence(
      history([
        { id: "mbx-a", sent: 500, replied: 30 },
        { id: "mbx-b", sent: 500, replied: 25 },
      ]),
      IDENTITIES,
    );
    if (!verdict.sufficient) throw new Error("unreachable");
    expect(verdict.anyDistinguishable).toBe(false);

    const fetchImpl = vi.fn().mockResolvedValue(
      anthropicResponse({
        summary:
          "These two mailboxes are performing the same. There is nothing to act on.",
        findings: [],
        cautions: ["Six months is a short history."],
      }),
    );

    await send(
      buildRepPerformanceInput({
        clientName: "Acme Safety",
        industry: null,
        reps: verdict.reps,
        totalSent: verdict.totalSent,
        totalReplied: verdict.totalReplied,
        totalPositive: verdict.totalPositive,
        lookbackDays: 180,
        anyDistinguishable: verdict.anyDistinguishable,
      }),
      fetchImpl,
    );

    const body = JSON.parse(
      (fetchImpl.mock.calls[0][1] as { body: string }).body,
    ) as { messages: Array<{ content: string }> };

    expect(body.messages[0].content).toContain(
      "NO sender differs from the others by more than chance",
    );
    // Both rows carry the verdict too, so the instruction cannot be lost in a
    // long table.
    expect(
      body.messages[0].content.match(/replies: within normal variation/g),
    ).toHaveLength(2);
  });

  it("would notice if the tool name drifted between sender and parser", () => {
    const stale = [
      { type: "tool_use", name: "record_rep_performance", input: { summary: "x" } },
    ];
    expect(parseRepPerformanceToolUse(stale)).toBeNull();
  });

  it("reads a refusal turn as NO explanation rather than as 'no difference'", async () => {
    // A model that declines answers in prose with no tool block. Reading that
    // as an empty findings list would print "these senders are performing the
    // same" about a client nobody actually analysed — a confident answer from a
    // refusal.
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: "I can't help with that." }],
        usage: { input_tokens: 950, output_tokens: 14 },
      }),
    } as unknown as Response);

    const response = await send("irrelevant", fetchImpl);

    expect(parseRepPerformanceToolUse(response.content)).toBeNull();
    // Still billable: the tokens were spent whatever the model decided.
    expect(response.inputTokens).toBe(950);
  });
});
