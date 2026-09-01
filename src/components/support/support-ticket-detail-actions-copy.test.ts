import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const componentPath = join(
  process.cwd(),
  "src/components/support/support-ticket-detail-actions.tsx",
);

/**
 * Row 156 (raised by row 136, cycle 197, finding 3): the Resolve & close
 * button had no minimum on the resolution note, so a ticket could be closed
 * with a blank note and the reporter never learned what was fixed. This repo
 * has no jsdom/render test harness (`npm test` is unit/pure only, per
 * AGENTS.md and the row-155 artefact) so — as established for row 154's
 * `google-reconnects-page-copy.test.ts` and row 155's `nav-config.badge.test.ts`
 * — the wiring itself is proven by asserting the real component source calls
 * the shared, unit-tested `isResolutionNoteReady` predicate to gate the
 * submit button, rather than duplicating a length check inline where it could
 * drift from the server action's own check.
 */
describe("Support ticket resolve form — minimum resolution note (row 156)", () => {
  it("imports the shared resolution-note-ready predicate", () => {
    const src = readFileSync(componentPath, "utf8");
    expect(src).toContain(
      'import { isResolutionNoteReady, MIN_RESOLUTION_NOTE_LENGTH } from "@/lib/support/support-labels"',
    );
  });

  it("disables the Resolve & close button until the note is ready", () => {
    const src = readFileSync(componentPath, "utf8");
    expect(src).toContain("const noteReady = isResolutionNoteReady(resolutionText)");
    expect(src).toContain("disabled={pending || !noteReady}");
  });

  it("tells the reporter-facing minimum length on screen", () => {
    const src = readFileSync(componentPath, "utf8");
    expect(src).toContain("${MIN_RESOLUTION_NOTE_LENGTH} characters");
  });
});
