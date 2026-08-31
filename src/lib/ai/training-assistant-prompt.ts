/**
 * The app-shell "how do I..." search bar (queue row 149) — the model's half.
 *
 * The prompt, the forced tool call and the parser. The lexical retrieval that
 * decides whether the model is called at all lives in
 * `src/lib/training/assistant-search.ts`; the network call, the metering and
 * the unanswered-question ledger live in
 * `src/server/ai/answer-training-question.ts`.
 *
 * THE STRUCTURAL GUARANTEE THIS FILE ENFORCES: the model is shown ONLY the
 * chunks the caller hands it (a handful of training-content passages a
 * lexical search already matched) and is told, explicitly and repeatedly, to
 * say "I don't know" rather than answer from outside them. It cannot invent a
 * citation either — `citedChunkIds` must be drawn from the ids listed in the
 * prompt, and the caller (`answer-training-question.ts`) re-validates every id
 * against the actual matched set before trusting it, so a model that ignores
 * this instruction produces an answer the caller discards, not one a staff
 * member sees.
 */

import type { TrainingSearchMatch } from "@/lib/training/assistant-search";

export const TRAINING_ASSISTANT_PROMPT_VERSION = "2026-08-31";

/** Long enough for a real how-to answer, short enough to stay a search-bar reply. */
export const MAX_ANSWER_CHARS = 1_500;

export const TRAINING_ASSISTANT_SYSTEM_PROMPT = [
  "You answer a staff member's 'how do I...' question about using this",
  "internal outreach tool, for the team at OpensDoors.",
  "",
  "You will be given a handful of short passages from the product's own",
  "training material, each with an id. These passages are the ONLY thing you",
  "know about this product. You have no other information about its screens,",
  "settings, or behaviour, and none was withheld from you on purpose — if the",
  "answer is not in the passages, you genuinely do not have it.",
  "",
  "If — and only if — the passages actually answer the question, write a short,",
  "direct answer in plain English, and list the id of every passage you drew on",
  "in citedChunkIds. Every claim in your answer must be traceable to a passage",
  "you cited. Do not cite a passage that does not support what you wrote.",
  "",
  "If the passages do not answer the question — even if they are on a related",
  "topic — set canAnswer to false. Do not guess, infer beyond what is written,",
  "or fill a gap with general knowledge about how software like this usually",
  "works. A wrong answer is worse than no answer, because the person reading it",
  "cannot tell the difference until it costs them something. 'I don't know' is",
  "correct and expected for a real fraction of questions — this tool covers",
  "training content only, not every screen, setting or client's data.",
  "",
  "You cannot see, and must never claim to know, any client's data, any",
  "prospect's data, or anything about a specific account or send. If asked",
  "about any of that, set canAnswer to false.",
  "",
  "Reply with the tool call only.",
].join("\n");

export const TRAINING_ASSISTANT_TOOL = {
  name: "record_training_assistant_answer",
  description:
    "Record whether the supplied training passages answer the staff member's question, and if so, the answer and which passages it came from.",
  input_schema: {
    type: "object" as const,
    properties: {
      canAnswer: {
        type: "boolean",
        description:
          "true only if the supplied passages, on their own, answer the question.",
      },
      answer: {
        type: "string",
        description:
          "When canAnswer is true: the answer, in plain English, grounded only in the cited passages. When canAnswer is false: a short, honest sentence saying the training material does not cover this.",
      },
      citedChunkIds: {
        type: "array",
        description:
          "The id of every passage the answer draws on. Required and non-empty when canAnswer is true. Every id must be one of the ids given in the passages below — never invented.",
        items: { type: "string" },
      },
    },
    required: ["canAnswer", "answer", "citedChunkIds"],
  },
} as const;

export interface ParsedTrainingAssistantAnswer {
  readonly canAnswer: boolean;
  readonly answer: string;
  readonly citedChunkIds: readonly string[];
}

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

/**
 * Build the user turn: the question, and the matched passages verbatim with
 * their ids. Not fenced as untrusted content the way a prospect's reply is —
 * every passage is this application's own training copy, not something a
 * third party wrote — but the question itself is a staff member's free text,
 * so it is clearly labelled as the question and nothing else.
 */
export function buildTrainingAssistantInput(
  question: string,
  matches: readonly TrainingSearchMatch[],
): string {
  const passages = matches.map(
    (m, i) => `Passage ${String(i + 1)} (id: ${m.chunk.id})\n${m.chunk.label}\n${m.chunk.text}`,
  );

  return [
    `Staff member's question: ${question}`,
    "",
    "Training passages available to you — these are everything you know:",
    "",
    ...passages,
  ].join("\n\n");
}

/**
 * Read the model's tool call. Null means the call produced nothing usable —
 * the caller treats that the same as "cannot answer" (`MODEL_UNSURE`), never
 * as license to invent a reply.
 */
export function parseTrainingAssistantToolUse(
  content: unknown,
): ParsedTrainingAssistantAnswer | null {
  if (!Array.isArray(content)) return null;

  const block = content.find(
    (b): b is { type: string; name?: string; input?: unknown } =>
      typeof b === "object" &&
      b !== null &&
      (b as { type?: unknown }).type === "tool_use",
  );
  if (!block || block.name !== TRAINING_ASSISTANT_TOOL.name) return null;

  const input = block.input;
  if (typeof input !== "object" || input === null) return null;
  const record = input as {
    canAnswer?: unknown;
    answer?: unknown;
    citedChunkIds?: unknown;
  };

  if (typeof record.canAnswer !== "boolean") return null;
  if (typeof record.answer !== "string") return null;
  const answer = truncate(record.answer.trim(), MAX_ANSWER_CHARS);
  if (!answer) return null;

  const citedChunkIds: string[] = [];
  if (Array.isArray(record.citedChunkIds)) {
    for (const raw of record.citedChunkIds) {
      if (typeof raw === "string" && raw.trim()) citedChunkIds.push(raw.trim());
    }
  }

  return { canAnswer: record.canAnswer, answer, citedChunkIds };
}
