import { describe, expect, it } from "vitest";

import { isBenignEmptyRecipientNote } from "./benign-job-note";

describe("isBenignEmptyRecipientNote", () => {
  it("recognises an empty follow-up step", () => {
    expect(
      isBenignEmptyRecipientNote(
        "No recipients are ready for this step. Open Review recipients, then launch again.",
      ),
    ).toBe(true);
    expect(
      isBenignEmptyRecipientNote(
        "client/seq/FOLLOW_UP_1: already complete or no ready recipients — skipped",
      ),
    ).toBe(true);
  });

  it("does not hide a real send failure", () => {
    expect(isBenignEmptyRecipientNote("The emails scored 72 after 3 checks. They were not sent.")).toBe(
      false,
    );
    expect(isBenignEmptyRecipientNote("database timeout")).toBe(false);
  });
});
