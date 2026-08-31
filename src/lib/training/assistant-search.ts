/**
 * Lexical search over the training-content chunks — the part that decides
 * whether a question is even IN scope before any model is ever called.
 *
 * Deliberately not a vector/embedding search: the corpus is a few dozen short
 * static passages, not a document store, and a dependency-free word-overlap
 * score is enough to tell "how do I set a branded signature" apart from "what
 * is the capital of France" — see `assistant-search.test.ts`. If the training
 * content grows enough that recall becomes the bottleneck, that is a deliberate
 * future upgrade, not a defect in this one.
 *
 * The threshold in `searchTrainingContent` is the structural half of "must not
 * guess": a question that matches nothing here never reaches
 * `answerTrainingQuestion`'s AI call at all, so there is nothing for the model
 * to invent an answer from.
 */

import { TRAINING_ASSISTANT_CHUNKS, type TrainingChunk } from "./assistant-content";

/** Words too common to carry meaning in a "how do I..." question. */
const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "do", "does", "did", "doing", "how", "what", "when", "where", "why", "who",
  "which", "this", "that", "these", "those", "to", "of", "in", "on", "for",
  "and", "or", "but", "with", "from", "at", "by", "as", "it", "its", "i",
  "you", "we", "my", "our", "your", "can", "could", "should", "would", "will",
  "not", "no", "yes", "so", "if", "then", "than", "into", "about", "up",
  "out", "get", "got", "have", "has", "had", "am", "me", "us",
]);

/** Lowercase, strip punctuation, split on whitespace, drop stopwords and 1-2 char noise. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !STOPWORDS.has(word));
}

export interface TrainingSearchMatch {
  readonly chunk: TrainingChunk;
  readonly score: number;
}

/**
 * A question must clear this fraction of its own meaningful words appearing
 * in a chunk before that chunk counts as "in scope". Majority-overlap rather
 * than any-overlap: a query sharing one generic word ("email") with half the
 * corpus should not count as a match on its own.
 */
export const MIN_MATCH_SCORE = 0.5;

/** How many chunks to hand to the model when a question is in scope. */
export const MAX_CONTEXT_CHUNKS = 5;

/**
 * Score every chunk against a question and return the ones that clear
 * `MIN_MATCH_SCORE`, best first. An empty result means "out of scope" — the
 * caller must not call the model when this is empty.
 */
export function searchTrainingContent(
  question: string,
  chunks: readonly TrainingChunk[] = TRAINING_ASSISTANT_CHUNKS,
): TrainingSearchMatch[] {
  const queryTokens = tokenize(question);
  if (queryTokens.length === 0) return [];

  const uniqueQueryTokens = new Set(queryTokens);

  const matches: TrainingSearchMatch[] = [];
  for (const chunk of chunks) {
    const chunkTokens = new Set(tokenize(chunk.text + " " + chunk.label));
    let overlap = 0;
    for (const token of uniqueQueryTokens) {
      if (chunkTokens.has(token)) overlap += 1;
    }
    const score = overlap / uniqueQueryTokens.size;
    if (score >= MIN_MATCH_SCORE) {
      matches.push({ chunk, score });
    }
  }

  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, MAX_CONTEXT_CHUNKS);
}
