import { describe, expect, it } from "vitest";

import {
  buildSendTimeAdviceInput,
  hourLabel,
  MAX_CAUTIONS,
  MAX_REASON_CHARS,
  MAX_RECOMMENDED_WINDOWS,
  MAX_SUMMARY_CHARS,
  parseSendTimeAdviceToolUse,
  SEND_TIME_ADVICE_PROMPT_VERSION,
  SEND_TIME_ADVICE_SYSTEM_PROMPT,
  SEND_TIME_ADVICE_TOOL,
} from "./send-time-advice";

import type { SlotStat } from "./send-time-evidence";

const SLOTS: SlotStat[] = [
  { weekday: 1, hour: 9, sent: 120, replied: 14, replyRatePercent: 12 },
  { weekday: 3, hour: 14, sent: 100, replied: 6, replyRatePercent: 6 },
  { weekday: 5, hour: 16, sent: 80, replied: 3, replyRatePercent: 4 },
];

function toolUse(input: unknown): unknown[] {
  return [{ type: "tool_use", name: SEND_TIME_ADVICE_TOOL.name, input }];
}

const GOOD_INPUT = {
  summary: "Monday mornings are clearly ahead; the rest are within noise.",
  windows: [
    { weekday: 1, startHour: 9, endHour: 11, reason: "Best rate in your table." },
  ],
  cautions: ["Only one quarter of sending is covered."],
};

describe("the tool schema cannot express a schedule", () => {
  /**
   * The load-bearing test of this feature, and the third instance of the rule
   * cycles 88 and 89 wrote down. A field the model could use to set a time
   * would be dead or dangerous, with nothing in between.
   */
  const serialised = JSON.stringify(SEND_TIME_ADVICE_TOOL).toLowerCase();

  it.each([
    "delayday",
    "delayhour",
    "cron",
    "schedule",
    "minute",
    "sequenceid",
    "templateid",
    "apply",
    "enable",
  ])("has no '%s' field anywhere in the schema", (word) => {
    expect(serialised).not.toContain(word);
  });

  it("offers only a weekday, two hours and prose", () => {
    const windowProps =
      SEND_TIME_ADVICE_TOOL.input_schema.properties.windows.items.properties;
    expect(Object.keys(windowProps).sort()).toEqual([
      "endHour",
      "reason",
      "startHour",
      "weekday",
    ]);
  });

  it("caps how many windows the model may name", () => {
    expect(SEND_TIME_ADVICE_TOOL.input_schema.properties.windows.maxItems).toBe(
      MAX_RECOMMENDED_WINDOWS,
    );
    expect(MAX_RECOMMENDED_WINDOWS).toBeLessThanOrEqual(3);
  });

  it("tells the model, in the prompt, that nothing it says is applied", () => {
    const prompt = SEND_TIME_ADVICE_SYSTEM_PROMPT.toLowerCase();
    expect(prompt).toContain("not applied automatically");
    expect(prompt).toContain("uk local time");
  });

  it("permits 'the time does not matter' as an answer", () => {
    // If an empty window list were an error, the model would learn to always
    // name a best time, including for a client that does not have one.
    expect(
      SEND_TIME_ADVICE_TOOL.input_schema.properties.windows.description.toLowerCase(),
    ).toContain("empty");
  });

  it("carries a prompt version so old advice is never read as current", () => {
    expect(SEND_TIME_ADVICE_PROMPT_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("buildSendTimeAdviceInput", () => {
  it("gives the model the counts rather than the raw timestamps", () => {
    const text = buildSendTimeAdviceInput({
      clientName: "Acme Ltd",
      industry: "Construction",
      slots: SLOTS,
      totalSent: 300,
      totalReplied: 23,
      lookbackDays: 180,
    });
    expect(text).toContain("Acme Ltd");
    expect(text).toContain("Construction");
    expect(text).toContain("Monday 09:00 | sent 120 | replies 14 | 12%");
    expect(text).toContain("Friday 16:00 | sent 80 | replies 3 | 4%");
    expect(text).toContain("300 emails sent, 23 replies");
    expect(text).toContain("last 180 days");
  });

  it("says the times are UK local, because the model cannot tell from a number", () => {
    const text = buildSendTimeAdviceInput({
      clientName: "Acme Ltd",
      industry: null,
      slots: SLOTS,
      totalSent: 300,
      totalReplied: 23,
      lookbackDays: 180,
    });
    expect(text).toContain("UK local time");
  });

  it("omits an industry line rather than printing an empty one", () => {
    const text = buildSendTimeAdviceInput({
      clientName: "Acme Ltd",
      industry: "   ",
      slots: SLOTS,
      totalSent: 300,
      totalReplied: 23,
      lookbackDays: 180,
    });
    expect(text).not.toContain("Industry:");
  });

  it("formats an hour as a UK clock time", () => {
    expect(hourLabel(9)).toBe("09:00");
    expect(hourLabel(16)).toBe("16:00");
  });
});

describe("parseSendTimeAdviceToolUse", () => {
  it("reads a well-formed answer", () => {
    const parsed = parseSendTimeAdviceToolUse(toolUse(GOOD_INPUT));
    expect(parsed).not.toBeNull();
    expect(parsed?.summary).toContain("Monday mornings");
    expect(parsed?.windows).toEqual([
      { weekday: 1, startHour: 9, endHour: 11, reason: "Best rate in your table." },
    ]);
    expect(parsed?.cautions).toHaveLength(1);
  });

  it("returns null for a non-array", () => {
    expect(parseSendTimeAdviceToolUse("nope")).toBeNull();
    expect(parseSendTimeAdviceToolUse(null)).toBeNull();
  });

  it("returns null when the model refused instead of calling the tool", () => {
    // A refusal must read as NO ADVICE. Anything else prints an empty
    // recommendation panel as though the answer were "no good times".
    expect(
      parseSendTimeAdviceToolUse([{ type: "text", text: "I cannot help." }]),
    ).toBeNull();
  });

  it("returns null when a different tool was called", () => {
    expect(
      parseSendTimeAdviceToolUse([
        { type: "tool_use", name: "record_campaign_review", input: GOOD_INPUT },
      ]),
    ).toBeNull();
  });

  it("returns null without a summary, because the summary is the answer", () => {
    expect(
      parseSendTimeAdviceToolUse(toolUse({ ...GOOD_INPUT, summary: "   " })),
    ).toBeNull();
    expect(
      parseSendTimeAdviceToolUse(toolUse({ windows: [], cautions: [] })),
    ).toBeNull();
  });

  it("keeps an EMPTY window list as a real answer", () => {
    const parsed = parseSendTimeAdviceToolUse(
      toolUse({
        summary: "No time of day makes a material difference for this client.",
        windows: [],
        cautions: [],
      }),
    );
    expect(parsed).not.toBeNull();
    expect(parsed?.windows).toEqual([]);
  });

  it("drops a window with no readable clock time rather than guessing 00:00", () => {
    const parsed = parseSendTimeAdviceToolUse(
      toolUse({
        ...GOOD_INPUT,
        windows: [
          { weekday: 1, startHour: "morning", endHour: 11, reason: "x" },
          { weekday: 2, startHour: 10, endHour: 12, reason: "kept" },
        ],
      }),
    );
    expect(parsed?.windows).toHaveLength(1);
    expect(parsed?.windows[0]?.reason).toBe("kept");
  });

  it("drops a window with a weekday outside the week", () => {
    const parsed = parseSendTimeAdviceToolUse(
      toolUse({
        ...GOOD_INPUT,
        windows: [{ weekday: 9, startHour: 10, endHour: 12, reason: "x" }],
      }),
    );
    expect(parsed?.windows).toEqual([]);
  });

  it("drops a window with no reason, so nothing unexplained reaches the screen", () => {
    const parsed = parseSendTimeAdviceToolUse(
      toolUse({
        ...GOOD_INPUT,
        windows: [{ weekday: 1, startHour: 9, endHour: 11, reason: "  " }],
      }),
    );
    expect(parsed?.windows).toEqual([]);
  });

  it("repairs a backwards window instead of rendering '10:00 to 09:00'", () => {
    const parsed = parseSendTimeAdviceToolUse(
      toolUse({
        ...GOOD_INPUT,
        windows: [{ weekday: 1, startHour: 10, endHour: 9, reason: "x" }],
      }),
    );
    expect(parsed?.windows[0]).toMatchObject({ startHour: 10, endHour: 11 });
  });

  it("caps the number of windows even if the model ignores maxItems", () => {
    const parsed = parseSendTimeAdviceToolUse(
      toolUse({
        ...GOOD_INPUT,
        windows: Array.from({ length: 9 }, (_, i) => ({
          weekday: 1,
          startHour: i + 8,
          endHour: i + 9,
          reason: "x",
        })),
      }),
    );
    expect(parsed?.windows).toHaveLength(MAX_RECOMMENDED_WINDOWS);
  });

  it("caps a reason short enough that it cannot carry anything else", () => {
    const parsed = parseSendTimeAdviceToolUse(
      toolUse({
        ...GOOD_INPUT,
        windows: [
          { weekday: 1, startHour: 9, endHour: 11, reason: "z".repeat(5_000) },
        ],
      }),
    );
    expect(parsed?.windows[0]?.reason).toHaveLength(MAX_REASON_CHARS);
  });

  it("caps the summary", () => {
    const parsed = parseSendTimeAdviceToolUse(
      toolUse({ ...GOOD_INPUT, summary: "z".repeat(9_000) }),
    );
    expect(parsed?.summary).toHaveLength(MAX_SUMMARY_CHARS);
  });

  it("caps and cleans the cautions", () => {
    const parsed = parseSendTimeAdviceToolUse(
      toolUse({
        ...GOOD_INPUT,
        cautions: ["  real  ", "", 42, ...Array<string>(9).fill("more")],
      }),
    );
    expect(parsed?.cautions.length).toBeLessThanOrEqual(MAX_CAUTIONS);
    expect(parsed?.cautions[0]).toBe("real");
  });

  it("survives cautions and windows being absent entirely", () => {
    const parsed = parseSendTimeAdviceToolUse(
      toolUse({ summary: "Nothing conclusive." }),
    );
    expect(parsed).not.toBeNull();
    expect(parsed?.windows).toEqual([]);
    expect(parsed?.cautions).toEqual([]);
  });
});
