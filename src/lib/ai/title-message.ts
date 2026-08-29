/**
 * Which message works for which job title — the model's half.
 *
 * The prompt, the forced tool call and the parser. The network call, the
 * metering and the database write live in `src/server/ai/advise-title-messages.ts`;
 * the table of counts, the job-title grouping and the test of which gaps are
 * real are computed offline, without a model, in `title-message-evidence.ts` and
 * `title-family.ts`.
 *
 * WHAT THE MODEL IS FOR. Not for finding the difference — that is arithmetic and
 * we do it ourselves, because a model asked to eyeball proportions will call a
 * 9%-versus-6% gap on 200 people a finding, and across a dozen audiences it will
 * find one every time. It is not for grouping the job titles either; that
 * decides who gets pooled with whom, and a grouping that moved between runs
 * would move the arithmetic under it. The model is handed our counts, our
 * families and our verdict on which gaps survived a multiplicity-adjusted
 * significance test, and asked one question a table cannot answer: given that
 * this campaign really did do better with this audience, what about the audience
 * might explain it.
 *
 * THE GUARDRAIL, WHICH IS A DIFFERENT ONE AGAIN.
 *
 * Cycle 88 refused the model a sequence's delays, 89 refused a critique
 * replacement copy, 90 refused the send schedule a field to write into, 91
 * refused any field that could rate a person. This feature's danger is the most
 * direct of the five: it is READ AS AN INSTRUCTION TO REWRITE LIVE COPY. An
 * operator told "the compliance angle wins with Finance" will go and change a
 * campaign that is mid-flight to real inboxes.
 *
 * So THE TOOL SCHEMA CONTAINS NO FIELD FOR SUGGESTED COPY, no subject line, no
 * opening paragraph, no rewrite, and no recommended change to any campaign. It
 * can say what the numbers show and what about the audience might explain it.
 * Anything that looked like draft text here would be one copy-paste from a real
 * send, and it would have arrived with the authority of a statistic — which is
 * exactly the combination this application refuses everywhere else.
 *
 * THE FACT THE MODEL CANNOT KNOW, AND WOULD OTHERWISE GET CONFIDENTLY WRONG.
 *
 * Nobody was randomised. A campaign targets a contact LIST that an operator
 * built, so the campaign that wins among Finance people may simply have been
 * pointed at better Finance people — bigger companies, a warmer source, a more
 * recent import. The fluent, plausible, unfalsifiable answer is "this subject
 * line resonates with finance buyers". The system prompt states the confound as
 * fact and the tool REQUIRES alternatives, so the model cannot reach for it
 * unchallenged.
 */

import type { TitleFamilyStat, TitleMessageCoverage } from "./title-message-evidence";

/**
 * Bumped when the prompt or schema changes in a way that makes old advice
 * non-comparable, and stored on every row so advice written under an older
 * prompt is never read as current.
 */
export const TITLE_MESSAGE_PROMPT_VERSION = "2026-08-29";

/** One per audience at most, and only where a gap survived the test. */
export const MAX_FINDINGS = 8;

/** Short enough to be a reason, too short to be a strategy document. */
export const MAX_OBSERVATION_CHARS = 400;

/** Enough for a paragraph of plain English about the table as a whole. */
export const MAX_SUMMARY_CHARS = 1_200;

export const MAX_ALTERNATIVES = 4;
export const MAX_CAUTIONS = 5;

export const TITLE_MESSAGE_SYSTEM_PROMPT = [
  "You help a B2B cold-outreach agency in the United Kingdom read a table",
  "showing how each of its campaigns performed with each kind of job title.",
  "",
  "FIVE FACTS ABOUT THIS SYSTEM. They are true, they are not obvious, and an",
  "explanation that contradicts any of them is wrong however well it reads:",
  "",
  "1. A row is a PERSON, not an email. Everyone in a campaign receives the same",
  "   five emails over about a month, and the campaign stops the moment they",
  "   reply. So 'replied' means that person replied at some point, and you",
  "   cannot say which of the five emails did it. Never attribute a result to a",
  "   particular email, a subject line, or a day of the sequence.",
  "2. NOBODY WAS RANDOMISED. Each campaign was aimed at a list somebody built by",
  "   hand. A campaign that wins with an audience may simply have been pointed at",
  "   a better list of that audience — larger companies, a warmer source, a more",
  "   recent import. This is the single most likely explanation for any gap and",
  "   it must appear among the alternatives every time.",
  "3. You have not seen the emails. You are reading counts, not copy. Do not",
  "   guess what a campaign said, and do not describe its tone, angle or subject",
  "   lines — you do not know them. Its name is a label, not a summary.",
  "4. Job titles were grouped by a fixed set of rules, not by judgement, and a",
  "   large share of them could not be grouped at all. The table says how much of",
  "   the outreach it covers. Do not generalise past that share.",
  "5. Deliverability is invisible here. A campaign sent while a mailbox was",
  "   spam-foldered or a domain was mis-authenticated will show a low reply rate",
  "   that has nothing to do with who it was aimed at.",
  "",
  "Only people whose campaign has had time to finish are counted, so a campaign",
  "launched recently may be absent or under-represented. Never say a campaign is",
  "new, growing, improving or declining — you cannot see time in this table.",
  "",
  "The counts are facts we computed. Do not recompute them, do not estimate",
  "others, and never quote a number that is not in the table.",
  "",
  "We have ALSO already tested which gaps are larger than chance, and each row",
  "says so. The bar was raised in proportion to how many comparisons were made,",
  "because across a dozen audiences the ordinary bar produces a false winner",
  "every time. Honour that verdict absolutely:",
  "- Explain ONLY the gaps marked as real.",
  "- A row marked 'within normal variation' means those campaigns performed the",
  "  same with that audience. Do not explain it, do not hint at it, do not rank",
  "  it, and do not call it a trend.",
  "- If NO gap is real, say plainly that no campaign is doing better than another",
  "  with any audience and there is nothing to act on. That is a valuable and",
  "  expected answer, and it is the correct one most of the time.",
  "",
  "Do not write, suggest or quote email copy, subject lines or openings, and do",
  "not tell anyone to change, pause or relaunch a campaign. You are explaining a",
  "table so a person can decide what to look into.",
  "",
  "Reply with the tool call only.",
].join("\n");

/**
 * The forced tool call.
 *
 * Note what is absent, and see the file header for why: no suggested copy, no
 * subject line, no recommended action on a campaign, no ranking of audiences by
 * value. An observation, the alternatives it does not rule out, and one thing to
 * check.
 */
export const TITLE_MESSAGE_TOOL = {
  name: "record_message_fit_by_job_title",
  description:
    "Record what this workspace's campaign-by-job-title table shows, and what could explain the differences that are larger than chance.",
  input_schema: {
    type: "object" as const,
    properties: {
      summary: {
        type: "string",
        description:
          "One short paragraph, in plain English, on what this table does and does not show, including how much of the outreach it covers. If no difference is larger than chance, say so here plainly and leave findings empty.",
      },
      findings: {
        type: "array",
        maxItems: MAX_FINDINGS,
        description:
          "One entry per campaign-and-audience pair the table marks as larger than chance. An EMPTY list is a valid and common answer. Never add an entry for a pair marked as within normal variation.",
        items: {
          type: "object",
          properties: {
            audienceLabel: {
              type: "string",
              description:
                "The job-title group exactly as it is named in the table, so the reader can find the row.",
            },
            messageLabel: {
              type: "string",
              description:
                "The campaign exactly as it is named in the table, so the reader can find the row.",
            },
            observation: {
              type: "string",
              description:
                "What this campaign did with this audience, in one or two sentences, quoting only numbers from the table. Describe the result, never the copy — you have not seen it.",
            },
            couldExplainIt: {
              type: "array",
              maxItems: MAX_ALTERNATIVES,
              description:
                "Things that could cause this, most plausible first. One of them must be that the two campaigns were aimed at differently-built lists of the same job titles. Others might include the time period each ran in, deliverability of the mailboxes used, or company size and source of the contacts. One short sentence each. Do not speculate about what the emails said.",
              items: { type: "string" },
            },
            checkFirst: {
              type: "string",
              description:
                "The one thing to look at to tell those explanations apart — typically how each campaign's contact list was built. A check, never an instruction to change a campaign.",
            },
          },
          required: [
            "audienceLabel",
            "messageLabel",
            "observation",
            "couldExplainIt",
            "checkFirst",
          ],
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

export interface TitleMessageFinding {
  readonly audienceLabel: string;
  readonly messageLabel: string;
  readonly observation: string;
  readonly couldExplainIt: readonly string[];
  readonly checkFirst: string;
}

export interface ParsedTitleMessageAdvice {
  readonly summary: string;
  readonly findings: readonly TitleMessageFinding[];
  readonly cautions: readonly string[];
}

export interface TitleMessageInput {
  readonly clientName: string;
  readonly industry: string | null;
  readonly families: readonly TitleFamilyStat[];
  readonly coverage: TitleMessageCoverage;
  readonly totalReplied: number;
  readonly totalPositive: number;
  readonly lookbackDays: number;
  readonly maturityDays: number;
  readonly comparisonCount: number;
  readonly anyDistinguishable: boolean;
}

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

/**
 * How a cell's verdict is written into the prompt.
 *
 * Plain English rather than a z-score, because the model reasons better about
 * "more replies than the other campaigns, by more than chance" than about
 * "z = 3.4", and because whatever appears here is the phrase it will echo back
 * into prose a human reads.
 */
export function cellVerdictPhrase(comparison: {
  kind: "indistinguishable" | "above" | "below";
}): string {
  if (comparison.kind === "above") {
    return "MORE replies than the other campaigns to this audience, by more than chance";
  }
  if (comparison.kind === "below") {
    return "FEWER replies than the other campaigns to this audience, by more than chance";
  }
  return "within normal variation";
}

/**
 * Build the user turn: our counts and our verdicts, as a table.
 *
 * Every value is an integer this application counted from its own database. The
 * only free text is campaign names staff typed and job-title family labels this
 * codebase defines — there is no prospect-authored text in it, so unlike a reply
 * or a campaign critique there is nothing here for an injection to hide in.
 */
export function buildTitleMessageInput(input: TitleMessageInput): string {
  const header = [
    `Client: ${input.clientName}`,
    input.industry?.trim() ? `Industry: ${input.industry.trim()}` : null,
    `History: campaigns people were enrolled in between ${String(input.lookbackDays)} and ${String(input.maturityDays)} days ago. The most recent ${String(input.maturityDays)} days are deliberately excluded, because those people are still being emailed and their result is not yet known.`,
    `People enrolled in a campaign: ${String(input.coverage.totalEnrollments)}`,
    `Covered by this table: ${String(input.coverage.compared)} of them (${String(input.coverage.comparedPercent)}%). Excluded: ${String(input.coverage.missingTitle)} with no job title recorded, ${String(input.coverage.ungrouped)} whose title could not be grouped, ${String(input.coverage.tooThinToCompare)} in groups too small to compare.`,
    `Within the table: ${String(input.totalReplied)} replies, ${String(input.totalPositive)} of them positive`,
    `${String(input.comparisonCount)} comparisons were made, so the bar for calling a gap real was raised accordingly.`,
    input.anyDistinguishable
      ? "At least one campaign beat the others with at least one audience by more than chance. Explain only those."
      : "NO campaign beat another with ANY audience by more than chance. They are performing the same — say so, and leave findings empty.",
  ].filter((line): line is string => line !== null);

  const blocks = input.families.map((family) => {
    const rows = family.messages.map(
      (message) =>
        `  ${message.label} | ${String(message.enrollments)} people | ${String(message.replied)} replied (${String(message.replyRatePercent)}%) | ${String(message.positive)} positive (${String(message.positiveRatePercent)}%) | ${cellVerdictPhrase(message.comparison)}`,
    );
    return [
      `${family.label} — ${String(family.enrollments)} people, ${String(family.replied)} replies (${String(family.replyRatePercent)}%)`,
      ...rows,
    ].join("\n");
  });

  return [
    "Read this workspace's campaign-by-job-title table and explain the differences that are real.",
    "",
    ...header,
    "",
    "Audience, then one line per campaign:",
    "  campaign | people | replied | positive | our verdict",
    "",
    ...blocks,
  ].join("\n");
}

/**
 * Read the model's tool call into something we are willing to store and show.
 *
 * Null means "we have no explanation": the client is still billed for the tokens
 * (they were spent) and the operator is told it did not work.
 *
 * A missing summary is fatal because it IS the answer. A single malformed
 * finding is not — dropping it keeps the rest of a paid-for answer. An empty
 * `findings` list is explicitly VALID rather than an error, because "no campaign
 * is doing better than another" is the correct answer most of the time and
 * treating it as a failure would train the model out of ever giving it.
 */
export function parseTitleMessageToolUse(
  content: unknown,
): ParsedTitleMessageAdvice | null {
  if (!Array.isArray(content)) return null;

  const block = content.find(
    (b): b is { type: string; name?: string; input?: unknown } =>
      typeof b === "object" &&
      b !== null &&
      (b as { type?: unknown }).type === "tool_use",
  );
  if (!block || block.name !== TITLE_MESSAGE_TOOL.name) return null;

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

  const findings: TitleMessageFinding[] = [];
  if (Array.isArray(record.findings)) {
    for (const raw of record.findings) {
      if (findings.length >= MAX_FINDINGS) break;
      if (typeof raw !== "object" || raw === null) continue;
      const row = raw as {
        audienceLabel?: unknown;
        messageLabel?: unknown;
        observation?: unknown;
        couldExplainIt?: unknown;
        checkFirst?: unknown;
      };

      const audienceLabel =
        typeof row.audienceLabel === "string" ? row.audienceLabel.trim() : "";
      const messageLabel =
        typeof row.messageLabel === "string" ? row.messageLabel.trim() : "";
      const observation =
        typeof row.observation === "string" ? row.observation.trim() : "";
      // A finding missing any of the three is dropped rather than patched: an
      // observation with no audience or no campaign cannot be checked against
      // the table it claims to describe, which is the only thing keeping it
      // honest.
      if (!audienceLabel || !messageLabel || !observation) continue;

      const couldExplainIt: string[] = [];
      if (Array.isArray(row.couldExplainIt)) {
        for (const cause of row.couldExplainIt) {
          if (couldExplainIt.length >= MAX_ALTERNATIVES) break;
          if (typeof cause !== "string") continue;
          const text = cause.trim();
          if (!text) continue;
          couldExplainIt.push(truncate(text, MAX_OBSERVATION_CHARS));
        }
      }

      // THE ONE RULE THE PARSER ENFORCES RATHER THAN REQUESTS. A finding that
      // names a campaign, an audience and a single confident cause reads as a
      // proven result about copy. The prompt asks for alternatives; this drops
      // the finding if they did not arrive, because nobody was randomised and a
      // lone explanation is therefore never warranted by this table.
      if (couldExplainIt.length === 0) continue;

      findings.push({
        audienceLabel: truncate(audienceLabel, MAX_OBSERVATION_CHARS),
        messageLabel: truncate(messageLabel, MAX_OBSERVATION_CHARS),
        observation: truncate(observation, MAX_OBSERVATION_CHARS),
        couldExplainIt,
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
