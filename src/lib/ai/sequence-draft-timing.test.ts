import { describe, expect, it } from "vitest";

import {
  AI_SEQUENCE_DRAFTING_CALL_TIMEOUT_MS,
  SEQUENCE_DRAFT_POLL_GIVE_UP_MS,
  SEQUENCE_DRAFT_RUN_GRACE_MS,
  sequenceDraftReasoningEffort,
  sequenceDraftRunDeadlineMs,
} from "./sequence-draft-timing";

describe("sequence draft timing", () => {
  it("gives a five-email grok draft three minutes under the Azure idle window", () => {
    expect(AI_SEQUENCE_DRAFTING_CALL_TIMEOUT_MS).toBe(180_000);
    // Reply classification stays on AI_CALL_TIMEOUT_MS (20s). This budget is
    // only the sequence-draft call. Azure App Service closes an idle outbound
    // socket at about four minutes, so the abort stays under that.
    expect(AI_SEQUENCE_DRAFTING_CALL_TIMEOUT_MS).toBeGreaterThan(20_000);
    expect(AI_SEQUENCE_DRAFTING_CALL_TIMEOUT_MS).toBeLessThan(240_000);
  });

  it("keeps grace for the save, and lets the page poll past the server deadline", () => {
    expect(SEQUENCE_DRAFT_RUN_GRACE_MS).toBe(30_000);
    expect(sequenceDraftRunDeadlineMs()).toBe(210_000);
    expect(SEQUENCE_DRAFT_POLL_GIVE_UP_MS).toBeGreaterThan(sequenceDraftRunDeadlineMs());
    expect(SEQUENCE_DRAFT_POLL_GIVE_UP_MS).toBe(240_000);
  });

  it("asks reasoning grok models for low effort and leaves other models alone", () => {
    expect(sequenceDraftReasoningEffort("grok-4.7")).toBe("low");
    expect(sequenceDraftReasoningEffort("grok-4.6")).toBe("low");
    expect(sequenceDraftReasoningEffort("grok-4.5")).toBe("low");
    expect(sequenceDraftReasoningEffort("grok-4-fast-non-reasoning")).toBeUndefined();
    expect(sequenceDraftReasoningEffort("grok-4.20-0309-non-reasoning")).toBeUndefined();
    expect(sequenceDraftReasoningEffort("claude-haiku-4-5-20251001")).toBeUndefined();
  });
});
