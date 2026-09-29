import { describe, expect, it } from "vitest";

import { jobErrorLines, sanitizeJobErrorText } from "./job-error-text";

describe("sanitizeJobErrorText", () => {
  it("keeps the failure sentence and removes secrets and email addresses", () => {
    const text = sanitizeJobErrorText(
      "connect postgres://opensdoors:super-secret@db.internal:5432/prod failed for ada@client.example",
    );
    expect(text).toMatch(/failed for \[redacted-email\]/);
    expect(text).not.toMatch(/super-secret|postgres:\/\/|ada@client/);
  });

  it("keeps a real scheduler error that has no personal data", () => {
    expect(
      sanitizeJobErrorText(
        "No recipients are ready for this step. Open Review recipients, then launch again.",
      ),
    ).toMatch(/No recipients are ready/);
  });
});

describe("jobErrorLines", () => {
  it("reads errors and skip notes from a scheduled outreach body", () => {
    expect(
      jobErrorLines({
        errors: ["client/seq/FOLLOW_UP_1: database timeout"],
        skippedSteps: ["client/seq/FOLLOW_UP_2: already complete or no ready recipients — skipped"],
      }),
    ).toEqual([
      "client/seq/FOLLOW_UP_1: database timeout",
      "skipped: client/seq/FOLLOW_UP_2: already complete or no ready recipients — skipped",
    ]);
  });

  it("returns nothing for a clean body", () => {
    expect(jobErrorLines({ ok: true, errors: [] })).toEqual([]);
    expect(jobErrorLines(null)).toEqual([]);
  });
});
