import { describe, expect, it } from "vitest";

import { sequenceDraftFailureMessage, sequenceDraftSuccessMessage } from "./sequence-draft-messages";

describe("sequence draft staff copy", () => {
  it("keeps the approval warning on a successful run", () => {
    expect(
      sequenceDraftSuccessMessage({
        steps: [{ absoluteDay: 1 }, { absoluteDay: 4 }],
        unknownPlaceholders: ["nickname"],
      }),
    ).toBe(
      "2 drafts written for days 1, 4. Read and approve each one before it can be sent. One or more drafts use a placeholder we cannot fill (nickname) — fix it before approving.",
    );
  });

  it("maps a provider timeout to the unavailable banner", () => {
    expect(sequenceDraftFailureMessage("The operation was aborted due to timeout")).toBe(
      "The AI provider is temporarily unavailable. Nothing was charged — try again shortly.",
    );
  });

  it("does not show a raw provider body", () => {
    expect(sequenceDraftFailureMessage("xai_http_400: bad request body")).toBe(
      "The sequence could not be drafted. Nothing was saved.",
    );
  });
});
