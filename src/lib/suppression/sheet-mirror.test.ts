import { describe, expect, it } from "vitest";

import { planSheetMirror } from "./sheet-mirror";

const previous = ["a@example.test", "b@example.test", "c@example.test"];

describe("planSheetMirror", () => {
  it("does not apply a sheet that comes back empty when rows are already stored", () => {
    const plan = planSheetMirror("EMAIL", new Set(), previous);
    expect(plan.apply).toBe(false);
    if (plan.apply) throw new Error("expected the empty sheet to be held");
    expect(plan.refusal).toMatchObject({ previousCount: 3, wouldWrite: 0, removed: 3 });
    expect(plan.refusal.reason).toContain("stay blocked");
  });

  it("mirrors a shorter non-empty sheet", () => {
    const plan = planSheetMirror("EMAIL", new Set(["a@example.test", "new@example.test"]), previous);
    expect(plan).toMatchObject({
      apply: true,
      remove: ["b@example.test", "c@example.test"],
      keptProtected: [],
    });
  });

  it("keeps an unsubscribe, bounce, or manual block that also sits on the sheet", () => {
    const plan = planSheetMirror(
      "DOMAIN",
      new Set(["kept.example"]),
      ["kept.example", "gone.example", "opt-out.example"],
      new Set(["opt-out.example"]),
    );
    expect(plan).toMatchObject({
      apply: true,
      remove: ["gone.example"],
      keptProtected: ["opt-out.example"],
    });
  });

  it("allows a first sync into an empty list, including an empty sheet", () => {
    expect(planSheetMirror("DOMAIN", new Set(["new.example"]), []).apply).toBe(true);
    expect(planSheetMirror("DOMAIN", new Set(), []).apply).toBe(true);
  });
});
