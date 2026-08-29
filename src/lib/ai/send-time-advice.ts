/**
 * AI-chosen send times — the model's half.
 *
 * The prompt, the forced tool call and the parser. The network call, the
 * metering and the database write live in `src/server/ai/advise-send-times.ts`;
 * the table of numbers this prompt is built from is computed offline, without a
 * model, in `send-time-evidence.ts`.
 *
 * WHAT THE MODEL IS FOR, AND WHAT IT IS NOT FOR.
 *
 * It is not for finding the pattern. The pattern is arithmetic and we do it
 * ourselves, because a model asked to compute reply rates from raw timestamps
 * will produce plausible numbers that are not the client's numbers, and an
 * invented percentage on an invoiceable screen is worse than no screen. The
 * model is given the counts we computed and is asked to READ them: which slots
 * are worth acting on, which differences are too small to chase, and what a
 * person should do on Monday morning.
 *
 * THE GUARDRAIL, WHICH IS THE SAME ONE AS THE LAST TWO FEATURES.
 *
 * Cycle 88 refused to let the model write a sequence's delays; cycle 89 refused
 * to let a critique carry replacement copy. This is the third instance of that
 * rule and the most direct: THE TOOL SCHEMA CONTAINS NO FIELD IN WHICH THE MODEL
 * CAN EXPRESS A SCHEDULE. No delay, no cron, no minutes, no date, no "apply to
 * this sequence". It can name an hour on a weekday and say why, in words.
 *
 * That is structural rather than advisory, and it has to be, because the value
 * of the field would be the danger. Nothing in this application decides when
 * mail leaves — a GitHub Actions cron does — so a schedule field would have
 * exactly two possible futures: dead, or wired to the dispatch clock by a later
 * cycle that read the field name as permission. A recommendation is a sentence
 * to a person. It is not a setting.
 */

import { weekdayLabel, type SlotStat } from "./send-time-evidence";

/**
 * Bumped when the prompt or schema changes in a way that makes old advice
 * non-comparable, and stored on every row so a recommendation written under an
 * older prompt is never read as a current one.
 */
export const SEND_TIME_ADVICE_PROMPT_VERSION = "2026-08-29";

/**
 * How many windows the model may name.
 *
 * Three, because the output is meant to change what a person does. A list of
 * eleven "best times" is a list of no best times, and it also invites the model
 * to name every slot in the table rather than choose between them.
 */
export const MAX_RECOMMENDED_WINDOWS = 3;

/** Short enough to be a reason, too short to be an essay. */
export const MAX_REASON_CHARS = 240;

/** Enough for a paragraph of plain English about the pattern as a whole. */
export const MAX_SUMMARY_CHARS = 1_000;

/** The honest "and here is what this does not prove" list. */
export const MAX_CAUTIONS = 4;

export const SEND_TIME_ADVICE_SYSTEM_PROMPT = [
  "You advise a B2B cold-outreach agency in the United Kingdom on when to send.",
  "",
  "You will be given one client's OWN sending history, already counted for you:",
  "for each weekday and hour, how many emails were sent and how many earned a",
  "reply. All times are UK local time. The counts are facts. Do not recompute",
  "them, do not estimate others, and never quote a number that is not in the table.",
  "",
  "Your job is to READ the table:",
  "- Name up to three windows worth sending in, best first.",
  "- Say plainly when a difference is too small to be worth acting on. Two slots",
  "  a percentage point apart, on a few hundred sends each, are the same slot.",
  "- Prefer a slot with more sends behind it over a flattering rate on fewer.",
  "- If the table shows no real difference between times, SAY SO. 'It does not",
  "  matter much for this client' is a valuable and permitted answer.",
  "",
  "Advise on general industry timing ONLY where the table does not speak. Be",
  "explicit about which of your reasons come from this client's data and which",
  "are general practice — an operator has to be able to tell them apart.",
  "",
  "You are recommending to a person who will decide. You are not configuring the",
  "system and you cannot change when anything is sent.",
  "What you write is advice, and it is not applied automatically.",
  "Never say that a change has been made, set, or scheduled.",
  "",
  "Reply with the tool call only.",
].join("\n");

/**
 * The forced tool call.
 *
 * Note what is absent, and see the file header for why: there is no delay, no
 * cron expression, no minute, no date, and no field naming a sequence to apply
 * this to. An hour on a weekday, and prose.
 */
export const SEND_TIME_ADVICE_TOOL = {
  name: "record_send_time_advice",
  description:
    "Record which times of week are worth sending in for this client, and why.",
  input_schema: {
    type: "object" as const,
    properties: {
      summary: {
        type: "string",
        description:
          "One short paragraph, in plain English, on what this client's history does and does not show about timing.",
      },
      windows: {
        type: "array",
        maxItems: MAX_RECOMMENDED_WINDOWS,
        description:
          "Up to three windows worth sending in, best first. An EMPTY list is a valid and useful answer when the table shows no real difference between times.",
        items: {
          type: "object",
          properties: {
            weekday: {
              type: "integer",
              minimum: 0,
              maximum: 6,
              description: "0 = Sunday, 1 = Monday, through to 6 = Saturday.",
            },
            startHour: {
              type: "integer",
              minimum: 0,
              maximum: 23,
              description: "First hour of the window, UK local time, 0-23.",
            },
            endHour: {
              type: "integer",
              minimum: 1,
              maximum: 24,
              description: "End of the window, UK local time, exclusive.",
            },
            reason: {
              type: "string",
              description:
                "Why this window, in one or two sentences. Say whether the reason comes from this client's table or from general practice.",
            },
          },
          required: ["weekday", "startHour", "endHour", "reason"],
        },
      },
      cautions: {
        type: "array",
        maxItems: MAX_CAUTIONS,
        description:
          "What this history does NOT prove. One short sentence each.",
        items: { type: "string" },
      },
    },
    required: ["summary", "windows", "cautions"],
  },
} as const;

export interface RecommendedWindow {
  readonly weekday: number;
  readonly startHour: number;
  readonly endHour: number;
  readonly reason: string;
}

export interface ParsedSendTimeAdvice {
  readonly summary: string;
  readonly windows: readonly RecommendedWindow[];
  readonly cautions: readonly string[];
}

export interface SendTimeAdviceInput {
  readonly clientName: string;
  readonly industry: string | null;
  readonly slots: readonly SlotStat[];
  readonly totalSent: number;
  readonly totalReplied: number;
  readonly lookbackDays: number;
}

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

/** Render an hour as a UK clock time, so the prompt reads the way the panel does. */
export function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

/**
 * Build the user turn: the counts, as a table.
 *
 * Not fenced as untrusted the way a reply or a campaign is, and the difference
 * is worth stating: every value below is an integer this application counted
 * from its own database. There is no prospect-authored text in it, so there is
 * nothing for an injection to hide in.
 */
export function buildSendTimeAdviceInput(input: SendTimeAdviceInput): string {
  const header = [
    `Client: ${input.clientName}`,
    input.industry?.trim() ? `Industry: ${input.industry.trim()}` : null,
    `History: the last ${String(input.lookbackDays)} days`,
    `Totals: ${String(input.totalSent)} emails sent, ${String(input.totalReplied)} replies`,
    "All times below are UK local time.",
  ].filter((line): line is string => line !== null);

  const rows = input.slots.map(
    (slot) =>
      `${weekdayLabel(slot.weekday)} ${hourLabel(slot.hour)} | sent ${String(slot.sent)} | replies ${String(slot.replied)} | ${String(slot.replyRatePercent)}%`,
  );

  return [
    "Read this client's sending history and advise on timing.",
    "",
    ...header,
    "",
    "Weekday and hour | emails sent | replies | reply rate",
    ...rows,
  ].join("\n");
}

/**
 * Read the model's tool call into something we are willing to store and show.
 *
 * Null means "we have no advice": the client is still billed for the tokens
 * (they were spent) and the operator is told it did not work.
 *
 * A missing summary is fatal because it IS the answer. A single malformed window
 * is not — dropping it keeps the rest of a paid-for answer. An empty `windows`
 * list is explicitly VALID rather than treated as a failure, because "the time
 * does not matter much for this client" is a real finding and one the prompt
 * asks for; turning it into an error would train the model out of ever saying it.
 */
export function parseSendTimeAdviceToolUse(
  content: unknown,
): ParsedSendTimeAdvice | null {
  if (!Array.isArray(content)) return null;

  const block = content.find(
    (b): b is { type: string; name?: string; input?: unknown } =>
      typeof b === "object" &&
      b !== null &&
      (b as { type?: unknown }).type === "tool_use",
  );
  if (!block || block.name !== SEND_TIME_ADVICE_TOOL.name) return null;

  const input = block.input;
  if (typeof input !== "object" || input === null) return null;
  const record = input as {
    summary?: unknown;
    windows?: unknown;
    cautions?: unknown;
  };

  if (typeof record.summary !== "string") return null;
  const summary = truncate(record.summary.trim(), MAX_SUMMARY_CHARS);
  if (!summary) return null;

  const windows: RecommendedWindow[] = [];
  if (Array.isArray(record.windows)) {
    for (const raw of record.windows) {
      if (windows.length >= MAX_RECOMMENDED_WINDOWS) break;
      if (typeof raw !== "object" || raw === null) continue;
      const row = raw as {
        weekday?: unknown;
        startHour?: unknown;
        endHour?: unknown;
        reason?: unknown;
      };

      const weekday = readInt(row.weekday);
      const startHour = readInt(row.startHour);
      const endHour = readInt(row.endHour);
      // A window with no readable clock time is dropped rather than guessed at.
      // Defaulting a missing hour to 0 would print "Sunday 00:00" as a
      // recommendation, which reads as an answer and is not one.
      if (weekday === null || startHour === null || endHour === null) continue;
      if (weekday < 0 || weekday > 6) continue;
      if (startHour < 0 || startHour > 23) continue;

      const reason = typeof row.reason === "string" ? row.reason.trim() : "";
      if (!reason) continue;

      windows.push({
        weekday,
        startHour,
        // Clamped to a real, forward-running window so the panel never renders
        // "10:00 to 09:00" and reachability is never asked about an empty set.
        endHour: Math.min(24, Math.max(startHour + 1, endHour)),
        reason: truncate(reason, MAX_REASON_CHARS),
      });
    }
  }

  const cautions: string[] = [];
  if (Array.isArray(record.cautions)) {
    for (const raw of record.cautions) {
      if (cautions.length >= MAX_CAUTIONS) break;
      if (typeof raw !== "string") continue;
      const text = raw.trim();
      if (!text) continue;
      cautions.push(truncate(text, MAX_REASON_CHARS));
    }
  }

  return { summary, windows, cautions };
}

function readInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.trunc(value);
}
