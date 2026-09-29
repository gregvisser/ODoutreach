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

/**
 * Extra words that show up in how-to questions ("a new mailbox") but are not
 * what the question is about. They stay in the text, and they do not have to
 * appear in a passage before that passage can match.
 */
const SOFT_QUERY_WORDS = new Set([
  "new", "another", "extra", "please", "want", "need", "just", "also",
  "some", "any", "all", "more", "own", "using", "use", "make", "tell",
  "show", "explain", "help", "there", "here", "them", "their", "work",
]);

/**
 * Product words staff spell more than one way. Each group shares one form so
 * "connect" matches "connecting" / "reconnect" and "mailbox" matches
 * "mailboxes". Kept as an explicit list rather than a general stemmer so an
 * unrelated word cannot collapse into a training term by accident.
 */
const ALIAS_GROUPS: readonly (readonly string[])[] = [
  ["mailbox", "mailboxes"],
  ["connect", "connecting", "connected", "connection", "reconnect", "reconnecting", "reconnects"],
  ["import", "imports", "importing", "imported"],
  ["sequence", "sequences"],
  ["template", "templates"],
  ["reply", "replies", "replying"],
  ["followup", "followups"],
  ["topup", "topups"],
  ["rocketreach"],
  ["donotcontact", "dnc", "suppression"],
  ["queue", "queued", "queues"],
  ["pacing", "paced"],
  ["industry", "industries"],
  ["draft", "drafts", "drafting"],
  ["launch", "launches", "launching", "launched"],
  ["client", "clients"],
  ["list", "lists"],
  ["signature", "signatures"],
  ["sender", "senders"],
];

const ALIAS_OF = new Map<string, string>();
for (const group of ALIAS_GROUPS) {
  const canonical = group[0] ?? "";
  for (const word of group) ALIAS_OF.set(word, canonical);
}

function canonicalToken(word: string): string {
  return ALIAS_OF.get(word) ?? word;
}

/**
 * Lowercase, fold a few product phrases into one word, strip punctuation,
 * split on whitespace, drop stopwords and 1-2 char noise, then fold aliases.
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/\bdo[- ]not[- ]contacts?\b/g, " donotcontact ")
    .replace(/\bfollow[- ]ups?\b/g, " followup ")
    .replace(/\btop[- ]ups?\b/g, " topup ")
    .replace(/\brocket\s*reach\b/g, " rocketreach ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !STOPWORDS.has(word))
    .map(canonicalToken);
}

/** Query words that have to be found. Soft words are dropped when anything else remains. */
export function queryTokens(question: string): string[] {
  const unique = [...new Set(tokenize(question))];
  const specific = unique.filter((word) => !SOFT_QUERY_WORDS.has(word));
  return specific.length > 0 ? specific : unique;
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
  const tokens = queryTokens(question);
  if (tokens.length === 0) return [];

  const uniqueQueryTokens = new Set(tokens);

  const matches: TrainingSearchMatch[] = [];
  for (const chunk of chunks) {
    const textTokens = new Set(tokenize(chunk.text));
    const labelTokens = new Set(tokenize(chunk.label));
    let overlap = 0;
    let labelOverlap = 0;
    for (const token of uniqueQueryTokens) {
      if (textTokens.has(token) || labelTokens.has(token)) overlap += 1;
      if (labelTokens.has(token)) labelOverlap += 1;
    }
    // Body overlap decides whether the passage is in scope. A matching title
    // ranks it ahead of an earlier passage that merely mentions the same words,
    // so "connect a new mailbox" surfaces the how-to rather than a status step.
    const coverage = overlap / uniqueQueryTokens.size;
    const score = coverage + (labelOverlap / uniqueQueryTokens.size) * 0.5;
    if (coverage >= MIN_MATCH_SCORE) {
      matches.push({ chunk, score });
    }
  }

  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, MAX_CONTEXT_CHUNKS);
}
