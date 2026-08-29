/**
 * Comparing senders — the model's half.
 *
 * The prompt, the forced tool call and the parser. The network call, the
 * metering and the database write live in
 * `src/server/ai/explain-rep-performance.ts`; the table of counts and the test
 * of which gaps are real are computed offline, without a model, in
 * `rep-performance-evidence.ts`.
 *
 * WHAT THE MODEL IS FOR. It is not for finding the difference — that is
 * arithmetic, and we do it ourselves, because a model asked to eyeball
 * proportions will call an 8%-versus-4% gap on 150 sends a finding, and it is
 * not one. The model is handed our counts AND our verdict on which gaps survive
 * a significance test, and asked to explain the surviving ones in plain English
 * to somebody who has to decide what to do on Monday.
 *
 * THE GUARDRAIL, WHICH IS A DIFFERENT ONE THIS TIME.
 *
 * The previous four features guarded against the model changing something:
 * cycle 88 refused it a sequence's delays, 89 refused a critique replacement
 * copy, 90 refused the send schedule a field to write into. This one cannot
 * change anything at all — it produces prose about a table. Its danger is not
 * automation, it is ATTRIBUTION, and it lands on a person.
 *
 * A screen headed "rep performance" with a named human, a low number and an AI
 * paragraph is evidence in a performance conversation, whatever anybody
 * intended. So THE TOOL SCHEMA CONTAINS NO FIELD IN WHICH THE MODEL CAN RATE,
 * RANK, GRADE OR RECOMMEND ANYTHING ABOUT A PERSON. There is no score, no
 * "top performer", no "needs coaching", no suggested action about an individual.
 * It can say what the numbers show and what could cause it, and every
 * explanation it offers must carry the other explanations it has not ruled out.
 *
 * That is structural rather than advisory because the value of such a field
 * would be exactly its danger — a `rating` column would be read as a judgement
 * this application had made about an employee, on data that (see below) cannot
 * support one.
 *
 * THE FACT THE MODEL CANNOT KNOW, AND WOULD OTHERWISE GET BADLY WRONG.
 *
 * Every sender in a client sends IDENTICAL copy — sequences and templates are
 * client-scoped, verified against the schema — and no human chooses which
 * prospect a mailbox gets or how many it sends. So the fluent, plausible,
 * completely false answer here is "Alex writes better subject lines". The
 * system prompt states the constraint as fact, and the tool requires
 * alternatives, so the model cannot reach for it.
 */

import type { RepStat } from "./rep-performance-evidence";

/**
 * Bumped when the prompt or schema changes in a way that makes old explanations
 * non-comparable, and stored on every row so an explanation written under an
 * older prompt is never read as a current one.
 */
export const REP_PERFORMANCE_PROMPT_VERSION = "2026-08-29";

/** One per sender at most, and only for senders whose gap survived the test. */
export const MAX_FINDINGS = 6;

/** Short enough to be a reason, too short to be a case against somebody. */
export const MAX_OBSERVATION_CHARS = 400;

/** Enough for a paragraph of plain English about the group as a whole. */
export const MAX_SUMMARY_CHARS = 1_200;

export const MAX_ALTERNATIVES = 4;
export const MAX_CAUTIONS = 4;

export const REP_PERFORMANCE_SYSTEM_PROMPT = [
  "You help a B2B cold-outreach agency in the United Kingdom read a table",
  "comparing the mailboxes it sends from.",
  "",
  "FOUR FACTS ABOUT THIS SYSTEM. They are true, they are not obvious, and an",
  "explanation that contradicts any of them is wrong however well it reads:",
  "",
  "1. Every sender in a workspace sends THE SAME WORDS. Email copy belongs to",
  "   the client, not to the sender. No sender writes their own subject lines,",
  "   so a difference between senders is NEVER a difference in writing.",
  "2. No person chooses who they email. The system picks the primary connected",
  "   mailbox, or the first one that can send, so each sender's list is whatever",
  "   happened to be queued while their mailbox was available.",
  "3. No person chooses how much they send. Volume is a daily cap and whether",
  "   the mailbox was connected that week.",
  "4. A sender is a MAILBOX. Its results are mostly a property of that mailbox",
  "   and its domain: authentication, reputation, warm-up, whether the token was",
  "   alive. Bounces especially are a deliverability fault, never an effort one.",
  "",
  "The counts are facts we computed. Do not recompute them, do not estimate",
  "others, and never quote a number that is not in the table.",
  "",
  "We have ALSO already tested which gaps are larger than chance, and each row",
  "says so. Honour that verdict absolutely:",
  "- Explain ONLY the gaps marked as real.",
  "- A row marked 'within normal variation' means those senders are performing",
  "  the same. Do not explain it, do not hint at it, do not rank it.",
  "- If NO gap is real, say plainly that the senders are performing the same and",
  "  there is nothing to act on. That is a valuable and expected answer, and it",
  "  is the correct one most of the time.",
  "",
  "For every difference you do explain, give the other explanations you cannot",
  "rule out from this table alone. There will always be some.",
  "",
  "You are describing mailboxes, not appraising staff. Do not rate, rank, grade",
  "or praise a person, do not suggest training, coaching or any action about an",
  "individual, and do not use words like 'underperforming' or 'top performer'.",
  "Write about what the mail did and what could cause it.",
  "",
  "Reply with the tool call only.",
].join("\n");

/**
 * The forced tool call.
 *
 * Note what is absent, and see the file header for why: no score, no rating, no
 * rank, no grade, no recommended action about a person. An observation about a
 * mailbox, the alternatives it does not rule out, and prose.
 */
export const REP_PERFORMANCE_TOOL = {
  name: "record_sender_comparison",
  description:
    "Record what this workspace's sender table shows, and what could explain the differences that are larger than chance.",
  input_schema: {
    type: "object" as const,
    properties: {
      summary: {
        type: "string",
        description:
          "One short paragraph, in plain English, on what this table does and does not show. If no difference is larger than chance, say so here plainly and leave findings empty.",
      },
      findings: {
        type: "array",
        maxItems: MAX_FINDINGS,
        description:
          "One entry per sender whose result the table marks as larger than chance. An EMPTY list is a valid and common answer. Never add an entry for a sender marked as within normal variation.",
        items: {
          type: "object",
          properties: {
            senderLabel: {
              type: "string",
              description:
                "The sender exactly as it is named in the table, so the reader can find the row.",
            },
            observation: {
              type: "string",
              description:
                "What this sender's mail did, in one or two sentences, quoting only numbers from the table. Describe the mail, not the person.",
            },
            likelyCauses: {
              type: "array",
              maxItems: MAX_ALTERNATIVES,
              description:
                "Things that could cause this, most plausible first — mailbox and domain conditions such as authentication, reputation, warm-up, a disconnected mailbox, or the mix of recipients that happened to be queued. One short sentence each.",
              items: { type: "string" },
            },
            checkFirst: {
              type: "string",
              description:
                "The one thing to check about this MAILBOX to tell those causes apart. A technical check, never an action about a person.",
            },
          },
          required: ["senderLabel", "observation", "likelyCauses", "checkFirst"],
        },
      },
      cautions: {
        type: "array",
        maxItems: MAX_CAUTIONS,
        description:
          "What this table does NOT prove. One short sentence each.",
        items: { type: "string" },
      },
    },
    required: ["summary", "findings", "cautions"],
  },
} as const;

export interface RepFinding {
  readonly senderLabel: string;
  readonly observation: string;
  readonly likelyCauses: readonly string[];
  readonly checkFirst: string;
}

export interface ParsedRepPerformance {
  readonly summary: string;
  readonly findings: readonly RepFinding[];
  readonly cautions: readonly string[];
}

export interface RepPerformanceInput {
  readonly clientName: string;
  readonly industry: string | null;
  readonly reps: readonly RepStat[];
  readonly totalSent: number;
  readonly totalReplied: number;
  readonly totalPositive: number;
  readonly lookbackDays: number;
  readonly anyDistinguishable: boolean;
}

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

/**
 * How a row's verdict is written into the prompt.
 *
 * Plain English rather than a z-score, because the model reasons better about
 * "larger than chance" than about "z = -2.4", and because whatever appears here
 * is the phrase the model will echo back into prose a human reads.
 */
export function verdictPhrase(rep: RepStat): string {
  const parts: string[] = [];
  if (rep.comparison.kind === "above") {
    parts.push("replies: MORE than the others by more than chance");
  } else if (rep.comparison.kind === "below") {
    parts.push("replies: FEWER than the others by more than chance");
  } else {
    parts.push("replies: within normal variation");
  }

  if (rep.bounceComparison.kind === "above") {
    parts.push("bounces: HIGHER than the others by more than chance");
  } else if (rep.bounceComparison.kind === "below") {
    parts.push("bounces: LOWER than the others by more than chance");
  } else {
    parts.push("bounces: within normal variation");
  }

  return parts.join("; ");
}

/**
 * Build the user turn: the counts and our verdicts, as a table.
 *
 * Every value is an integer this application counted from its own database, and
 * the labels are mailbox names staff typed. There is no prospect-authored text
 * in it, so unlike a reply or a campaign there is nothing here for an injection
 * to hide in.
 */
export function buildRepPerformanceInput(input: RepPerformanceInput): string {
  const header = [
    `Client: ${input.clientName}`,
    input.industry?.trim() ? `Industry: ${input.industry.trim()}` : null,
    `History: the last ${String(input.lookbackDays)} days`,
    `Totals: ${String(input.totalSent)} emails sent, ${String(input.totalReplied)} replies, ${String(input.totalPositive)} of them positive`,
    input.anyDistinguishable
      ? "At least one sender differs from the others by more than chance. Explain only those."
      : "NO sender differs from the others by more than chance. These senders are performing the same — say so, and leave findings empty.",
  ].filter((line): line is string => line !== null);

  const rows = input.reps.map(
    (rep) =>
      `${rep.label} | sent ${String(rep.sent)} | replies ${String(rep.replied)} (${String(rep.replyRatePercent)}%) | positive ${String(rep.positive)} (${String(rep.positiveRatePercent)}%) | bounced ${String(rep.bounced)} (${String(rep.bounceRatePercent)}%) | ${verdictPhrase(rep)}`,
  );

  return [
    "Read this workspace's sender table and explain the differences that are real.",
    "",
    ...header,
    "",
    "Sender | emails sent | replies | positive replies | bounces | our verdict",
    ...rows,
  ].join("\n");
}

/**
 * Read the model's tool call into something we are willing to store and show.
 *
 * Null means "we have no explanation": the client is still billed for the
 * tokens (they were spent) and the operator is told it did not work.
 *
 * A missing summary is fatal because it IS the answer. A single malformed
 * finding is not — dropping it keeps the rest of a paid-for answer. An empty
 * `findings` list is explicitly VALID rather than an error, because "these
 * senders are performing the same" is the correct answer most of the time and
 * treating it as a failure would train the model out of ever giving it.
 */
export function parseRepPerformanceToolUse(
  content: unknown,
): ParsedRepPerformance | null {
  if (!Array.isArray(content)) return null;

  const block = content.find(
    (b): b is { type: string; name?: string; input?: unknown } =>
      typeof b === "object" &&
      b !== null &&
      (b as { type?: unknown }).type === "tool_use",
  );
  if (!block || block.name !== REP_PERFORMANCE_TOOL.name) return null;

  const input = block.input;
  if (typeof input !== "object" || input === null) return null;
  const record = input as {
    summary?: unknown;
    findings?: unknown;
    cautions?: unknown;
  };

  if (typeof record.summary !== "string") return null;
  const summary = truncate(record.summary.trim(), MAX_SUMMARY_CHARS);
  if (!summary) return null;

  const findings: RepFinding[] = [];
  if (Array.isArray(record.findings)) {
    for (const raw of record.findings) {
      if (findings.length >= MAX_FINDINGS) break;
      if (typeof raw !== "object" || raw === null) continue;
      const row = raw as {
        senderLabel?: unknown;
        observation?: unknown;
        likelyCauses?: unknown;
        checkFirst?: unknown;
      };

      const senderLabel =
        typeof row.senderLabel === "string" ? row.senderLabel.trim() : "";
      const observation =
        typeof row.observation === "string" ? row.observation.trim() : "";
      // A finding with no sender or no observation is dropped rather than
      // patched: "" as a sender name would print an unattributed accusation.
      if (!senderLabel || !observation) continue;

      const likelyCauses: string[] = [];
      if (Array.isArray(row.likelyCauses)) {
        for (const cause of row.likelyCauses) {
          if (likelyCauses.length >= MAX_ALTERNATIVES) break;
          if (typeof cause !== "string") continue;
          const text = cause.trim();
          if (!text) continue;
          likelyCauses.push(truncate(text, MAX_OBSERVATION_CHARS));
        }
      }

      // THE ONE RULE THE PARSER ENFORCES RATHER THAN REQUESTS. A finding that
      // names a sender and offers a single explanation reads as a diagnosis. The
      // prompt asks for alternatives; this drops the finding if they did not
      // arrive, because a lone confident cause attached to a person's mailbox is
      // the failure mode this whole feature is built around.
      if (likelyCauses.length === 0) continue;

      findings.push({
        senderLabel: truncate(senderLabel, MAX_OBSERVATION_CHARS),
        observation: truncate(observation, MAX_OBSERVATION_CHARS),
        likelyCauses,
        checkFirst:
          typeof row.checkFirst === "string"
            ? truncate(row.checkFirst.trim(), MAX_OBSERVATION_CHARS)
            : "",
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
      cautions.push(truncate(text, MAX_OBSERVATION_CHARS));
    }
  }

  return { summary, findings, cautions };
}
