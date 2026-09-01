import { describe, expect, it } from "vitest";

import { isResolutionNoteReady, MIN_RESOLUTION_NOTE_LENGTH } from "./support-labels";

/**
 * Row 156 (raised by row 136, cycle 197, finding 3): `resolveSupportTicket`
 * accepted `input.resolutionNote.trim() || null` with no minimum at all, so a
 * ticket could be resolved and closed with a blank note and the reporter never
 * learned what was fixed. `isResolutionNoteReady` is the single pure seam the
 * server action and the resolve form both call, so the two can never disagree
 * on what counts as "long enough".
 */
describe("isResolutionNoteReady", () => {
  it("rejects a blank note", () => {
    expect(isResolutionNoteReady("")).toBe(false);
  });

  it("rejects a whitespace-only note", () => {
    expect(isResolutionNoteReady("           ")).toBe(false);
  });

  it("rejects a note under the minimum length", () => {
    expect(isResolutionNoteReady("short")).toBe(false);
    expect("short".length).toBeLessThan(MIN_RESOLUTION_NOTE_LENGTH);
  });

  it("rejects a note that is only long enough before trimming", () => {
    expect(isResolutionNoteReady("   fix   ")).toBe(false);
  });

  it("accepts a note exactly at the minimum length once trimmed", () => {
    const note = "a".repeat(MIN_RESOLUTION_NOTE_LENGTH);
    expect(note.length).toBe(MIN_RESOLUTION_NOTE_LENGTH);
    expect(isResolutionNoteReady(note)).toBe(true);
  });

  it("accepts a real resolution note", () => {
    expect(isResolutionNoteReady("Deployed the fix in PR #547.")).toBe(true);
  });
});
