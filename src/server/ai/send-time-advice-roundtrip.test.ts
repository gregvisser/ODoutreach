import { describe, expect, it, vi } from "vitest";

import {
  buildSendTimeAdviceInput,
  parseSendTimeAdviceToolUse,
  SEND_TIME_ADVICE_SYSTEM_PROMPT,
  SEND_TIME_ADVICE_TOOL,
} from "@/lib/ai/send-time-advice";
import {
  assessSendTimeEvidence,
  windowReachability,
  type SendOutcome,
} from "@/lib/ai/send-time-evidence";

import { callAnthropicMessages } from "./anthropic-messages";

/**
 * Round-trip: the REAL evidence builder, the REAL request builder, the REAL
 * HTTP layer, the REAL parser, and the REAL reachability check. Only `fetch`
 * is faked.
 *
 * WHY THIS EXISTS, given the feature is already covered three times over.
 *
 * `advise-send-times.test.ts` mocks `callAnthropicMessages`;
 * `send-time-advice.test.ts` hands the parser a hand-written block; and
 * `send-time-evidence.test.ts` never goes near the model. All three are useful
 * and all three share one blind spot: nothing asserts that the tool schema we
 * SEND and the shape we PARSE are the same agreement, or that a window the
 * model names can actually be checked against the sender's real hours. A drift
 * anywhere on that path would leave every other test green and the feature dead
 * in production — this project's most-repeated defect, six times in one week:
 * built, wired, reporting success, never firing.
 *
 * This cannot call the real API (there is no key, and a test that spent money
 * would be a bad test). What it can do is prove every layer we own agrees, so
 * the only untested link left is Anthropic's own.
 */

/** A history that passes the evidence gate, built the way production builds it. */
function history(): SendOutcome[] {
  const rows: SendOutcome[] = [];
  const slots: [string, number][] = [
    ["2026-07-13T08:30:00Z", 14], // Monday 09:00 UK (BST)
    ["2026-07-14T09:30:00Z", 4], // Tuesday 10:00 UK
    ["2026-07-15T10:30:00Z", 9], // Wednesday 11:00 UK
    ["2026-07-16T13:30:00Z", 6], // Thursday 14:00 UK
  ];
  for (const [iso, replies] of slots) {
    for (let i = 0; i < 100; i += 1) {
      rows.push({ sentAt: new Date(iso), replied: i < replies });
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
        { type: "tool_use", id: "toolu_01", name: SEND_TIME_ADVICE_TOOL.name, input },
      ],
      usage: { input_tokens: 1_104, output_tokens: 196 },
    }),
  } as unknown as Response;
}

describe("send-time advice round-trip", () => {
  it("counts the history, sends the forced tool, and parses what comes back", async () => {
    const verdict = assessSendTimeEvidence(history());
    expect(verdict.sufficient).toBe(true);
    if (!verdict.sufficient) throw new Error("unreachable");

    const fetchImpl = vi.fn().mockResolvedValue(
      anthropicResponse({
        summary: "Monday mornings lead clearly; the rest is inside the noise.",
        windows: [
          {
            weekday: 1,
            startHour: 9,
            endHour: 11,
            reason: "14% on 100 sends, the strongest slot in your table.",
          },
        ],
        cautions: ["Only four slots have enough sending behind them."],
      }),
    );

    const response = await callAnthropicMessages({
      apiKey: "sk-ant-test",
      model: "claude-haiku-4-5-20251001",
      system: SEND_TIME_ADVICE_SYSTEM_PROMPT,
      userText: buildSendTimeAdviceInput({
        clientName: "Acme Safety",
        industry: "Health and safety consulting",
        slots: verdict.slots,
        totalSent: verdict.totalSent,
        totalReplied: verdict.totalReplied,
        lookbackDays: 180,
      }),
      maxTokens: 1_500,
      tool: SEND_TIME_ADVICE_TOOL,
      fetchImpl,
    });

    const body = JSON.parse(
      (fetchImpl.mock.calls[0][1] as { body: string }).body,
    ) as {
      tools: Array<{ name: string }>;
      tool_choice: { type: string; name: string };
      system: string;
      messages: Array<{ content: string }>;
    };

    // The request actually carried our tool, and forced its use.
    expect(body.tools[0].name).toBe(SEND_TIME_ADVICE_TOOL.name);
    expect(body.tool_choice).toEqual({
      type: "tool",
      name: SEND_TIME_ADVICE_TOOL.name,
    });

    // The counts the model is asked to read are OUR counts, in UK local hours —
    // BST included, which is the bug this whole feature is one hour away from.
    expect(body.messages[0].content).toContain("Monday 09:00 | sent 100 | replies 14");
    expect(body.messages[0].content).toContain("UK local time");
    expect(body.messages[0].content).toContain("400 emails sent, 33 replies");

    // The tokens that become the bill survived the trip.
    expect(response.inputTokens).toBe(1_104);
    expect(response.outputTokens).toBe(196);

    // The parser we ship reads what the API we ship talking to sent back...
    const parsed = parseSendTimeAdviceToolUse(response.content);
    expect(parsed).not.toBeNull();
    expect(parsed?.windows).toHaveLength(1);

    // ...and the window it names can be checked against the sender's real hours,
    // which is the only thing that turns advice into something actionable.
    const window = parsed?.windows[0];
    expect(window).toBeDefined();
    expect(
      windowReachability(window!.weekday, window!.startHour, window!.endHour),
    ).toBe("always");
  });

  it("would notice if the tool name drifted between sender and parser", () => {
    const stale = [
      { type: "tool_use", name: "record_best_send_times", input: { summary: "x" } },
    ];
    expect(parseSendTimeAdviceToolUse(stale)).toBeNull();
  });

  it("reads a refusal turn as NO advice rather than as 'no good times'", async () => {
    // A model that declines answers in prose with no tool block. Reading that as
    // an empty window list would print "no time of day makes a difference" on a
    // client nobody actually analysed — a confident answer from a refusal.
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: "I can't help with that." }],
        usage: { input_tokens: 900, output_tokens: 12 },
      }),
    } as unknown as Response);

    const verdict = assessSendTimeEvidence(history());
    if (!verdict.sufficient) throw new Error("unreachable");

    const response = await callAnthropicMessages({
      apiKey: "sk-ant-test",
      model: "claude-haiku-4-5-20251001",
      system: SEND_TIME_ADVICE_SYSTEM_PROMPT,
      userText: buildSendTimeAdviceInput({
        clientName: "Acme Safety",
        industry: null,
        slots: verdict.slots,
        totalSent: verdict.totalSent,
        totalReplied: verdict.totalReplied,
        lookbackDays: 180,
      }),
      maxTokens: 1_500,
      tool: SEND_TIME_ADVICE_TOOL,
      fetchImpl,
    });

    expect(parseSendTimeAdviceToolUse(response.content)).toBeNull();
    // Still billable: the tokens were spent whatever the model decided.
    expect(response.inputTokens).toBe(900);
  });

  it("flags a recommendation the automatic sender cannot actually reach", async () => {
    // The failure mode that would otherwise ship silently: the model names a
    // perfectly sensible-sounding 07:00 start, and in summer the sender's first
    // firing is 08:00 UK. Advice nobody can act on must SAY so.
    const fetchImpl = vi.fn().mockResolvedValue(
      anthropicResponse({
        summary: "Early is better here.",
        windows: [
          { weekday: 2, startHour: 7, endHour: 8, reason: "Before the inbox fills." },
          { weekday: 6, startHour: 10, endHour: 12, reason: "Quiet weekend inboxes." },
        ],
        cautions: [],
      }),
    );

    const response = await callAnthropicMessages({
      apiKey: "sk-ant-test",
      model: "claude-haiku-4-5-20251001",
      system: SEND_TIME_ADVICE_SYSTEM_PROMPT,
      userText: "irrelevant",
      maxTokens: 1_500,
      tool: SEND_TIME_ADVICE_TOOL,
      fetchImpl,
    });

    const parsed = parseSendTimeAdviceToolUse(response.content);
    expect(parsed?.windows).toHaveLength(2);
    const [early, weekend] = parsed!.windows;
    expect(windowReachability(early.weekday, early.startHour, early.endHour)).toBe(
      "winter_only",
    );
    expect(
      windowReachability(weekend.weekday, weekend.startHour, weekend.endHour),
    ).toBe("never");
  });
});
