/**
 * Queue item 27, defect (6), second half — "the same 60-word help paragraph
 * repeated verbatim on all four connected rows".
 *
 * The Sender-signatures table prints `getOperatorSignatureState(...)
 * .recommendedAction` in every row. That string is chosen from a fixed set of
 * six templates, so four mailboxes in the same state print four identical
 * paragraphs one under another. A sentence that is the same on more than one
 * row is not data about a row — it is help, and help belongs above the table
 * once.
 *
 * This module is the rule, kept pure so it can be asserted without a browser.
 */
import { describe, expect, it } from "vitest";

import {
  describeSignatureGuidanceScope,
  planSignatureRowGuidance,
} from "./signature-row-guidance";

/** The real string the four connected opensdoors mailboxes all print today. */
const REAL_DUPLICATE =
  "Confirm it looks right with Preview signature. If a second signature appears in the recipient's copy, your Microsoft/Exchange admin is adding one too — ask them to turn that off to avoid duplicates.";

describe("planSignatureRowGuidance", () => {
  it("hoists advice that is identical on more than one row", () => {
    const plan = planSignatureRowGuidance([
      { key: "a@x.test", action: REAL_DUPLICATE },
      { key: "b@x.test", action: REAL_DUPLICATE },
      { key: "c@x.test", action: REAL_DUPLICATE },
      { key: "d@x.test", action: REAL_DUPLICATE },
    ]);

    // The defect: four copies. After the fix, none in the rows and one above.
    expect(plan.perRow).toEqual([null, null, null, null]);
    expect(plan.shared).toHaveLength(1);
    expect(plan.shared[0]!.text).toBe(REAL_DUPLICATE);
    expect(plan.shared[0]!.keys).toEqual([
      "a@x.test",
      "b@x.test",
      "c@x.test",
      "d@x.test",
    ]);
  });

  it("leaves advice that belongs to exactly one row on that row", () => {
    const plan = planSignatureRowGuidance([
      { key: "a@x.test", action: "Use Connect on the mailbox row, then return here." },
      { key: "b@x.test", action: REAL_DUPLICATE },
    ]);

    expect(plan.perRow).toEqual([
      "Use Connect on the mailbox row, then return here.",
      REAL_DUPLICATE,
    ]);
    expect(plan.shared).toEqual([]);
  });

  it("hoists only the repeated sentence when the mailboxes are in mixed states", () => {
    // The live opensdoors shape: four connected + one that failed to connect.
    // The repeated paragraph must go; the one row that says something
    // different must keep saying it.
    const plan = planSignatureRowGuidance([
      { key: "a@x.test", action: REAL_DUPLICATE },
      { key: "b@x.test", action: REAL_DUPLICATE },
      { key: "joe@x.test", action: "Use Connect on the mailbox row, then return here." },
      { key: "c@x.test", action: REAL_DUPLICATE },
      { key: "d@x.test", action: REAL_DUPLICATE },
    ]);

    expect(plan.perRow).toEqual([
      null,
      null,
      "Use Connect on the mailbox row, then return here.",
      null,
      null,
    ]);
    expect(plan.shared).toHaveLength(1);
    expect(plan.shared[0]!.keys).toEqual([
      "a@x.test",
      "b@x.test",
      "c@x.test",
      "d@x.test",
    ]);
  });

  it("keeps two different repeated paragraphs apart, in first-seen order", () => {
    const plan = planSignatureRowGuidance([
      { key: "a@x.test", action: "Second." },
      { key: "b@x.test", action: "First." },
      { key: "c@x.test", action: "First." },
      { key: "d@x.test", action: "Second." },
    ]);

    expect(plan.shared.map((s) => s.text)).toEqual(["Second.", "First."]);
    expect(plan.perRow).toEqual([null, null, null, null]);
  });

  it("treats whitespace-only advice as nothing to say, never as a duplicate", () => {
    const plan = planSignatureRowGuidance([
      { key: "a@x.test", action: "   " },
      { key: "b@x.test", action: "" },
    ]);

    expect(plan.perRow).toEqual([null, null]);
    expect(plan.shared).toEqual([]);
  });

  it("compares on trimmed text, and emits the trimmed text", () => {
    const plan = planSignatureRowGuidance([
      { key: "a@x.test", action: "  Same advice.  " },
      { key: "b@x.test", action: "Same advice." },
    ]);

    expect(plan.shared).toHaveLength(1);
    expect(plan.shared[0]!.text).toBe("Same advice.");
  });

  it("says nothing at all for a workspace with no mailboxes", () => {
    const plan = planSignatureRowGuidance([]);
    expect(plan.perRow).toEqual([]);
    expect(plan.shared).toEqual([]);
  });
});

describe("describeSignatureGuidanceScope", () => {
  it("names the mailboxes while the list is short enough to read", () => {
    expect(describeSignatureGuidanceScope(["a@x.test"])).toBe("a@x.test");
    expect(describeSignatureGuidanceScope(["a@x.test", "b@x.test"])).toBe(
      "a@x.test and b@x.test",
    );
    expect(
      describeSignatureGuidanceScope(["a@x.test", "b@x.test", "c@x.test"]),
    ).toBe("a@x.test, b@x.test and c@x.test");
  });

  it("counts them once the list is longer than a sentence should carry", () => {
    expect(
      describeSignatureGuidanceScope([
        "a@x.test",
        "b@x.test",
        "c@x.test",
        "d@x.test",
      ]),
    ).toBe("4 mailboxes");
  });

  it("returns an empty string for an empty scope rather than 0 mailboxes", () => {
    expect(describeSignatureGuidanceScope([])).toBe("");
  });
});
