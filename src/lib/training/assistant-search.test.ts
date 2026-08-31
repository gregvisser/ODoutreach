import { describe, expect, it } from "vitest";

import { MIN_MATCH_SCORE, searchTrainingContent, tokenize } from "./assistant-search";
import { TRAINING_ASSISTANT_CHUNKS } from "./assistant-content";

describe("tokenize", () => {
  it("lowercases, strips punctuation and drops stopwords/short noise", () => {
    expect(tokenize("How do I set a branded signature?")).toEqual([
      "set",
      "branded",
      "signature",
    ]);
  });

  it("returns nothing for a question made only of stopwords", () => {
    expect(tokenize("How do I do that")).toEqual([]);
  });
});

describe("searchTrainingContent", () => {
  it("finds the real chunk about branded signatures for an in-scope question", () => {
    const matches = searchTrainingContent("How do I set a branded signature?");

    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].score).toBeGreaterThanOrEqual(MIN_MATCH_SCORE);
    expect(
      matches.some((m) => /branded signature/i.test(m.chunk.text)),
    ).toBe(true);
  });

  it("returns nothing for a question with no meaningful words", () => {
    expect(searchTrainingContent("how do I do that")).toEqual([]);
  });

  it("returns nothing for a question entirely outside the training content's subject matter", () => {
    // Deliberately unrelated to anything an outreach tool's training would
    // cover — this is the structural guarantee that keeps the model from ever
    // being asked about it: an out-of-scope question must produce zero
    // matches, not a low-confidence one.
    const matches = searchTrainingContent(
      "What is the boiling point of tungsten on Mars at sea level pressure?",
    );
    expect(matches).toEqual([]);
  });

  it("never returns more than MAX_CONTEXT_CHUNKS, even for a very generic query", () => {
    // "email" appears across many chunks; the cap is what keeps a broad query
    // from handing the model the whole corpus.
    const matches = searchTrainingContent("email");
    expect(matches.length).toBeLessThanOrEqual(5);
  });

  it("searches against the real exported corpus by default", () => {
    expect(TRAINING_ASSISTANT_CHUNKS.length).toBeGreaterThan(10);
    const matches = searchTrainingContent("How do I connect a mailbox?");
    expect(matches.length).toBeGreaterThan(0);
  });
});
