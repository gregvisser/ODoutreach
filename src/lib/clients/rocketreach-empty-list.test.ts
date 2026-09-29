import { describe, expect, it } from "vitest";
import { shouldDiscardNewImportList } from "./rocketreach-empty-list";

describe("shouldDiscardNewImportList", () => {
  it("discards only a list this import created when it is still empty", () => {
    expect(shouldDiscardNewImportList(true, 0)).toBe(true);
    expect(shouldDiscardNewImportList(true, 2)).toBe(false);
    expect(shouldDiscardNewImportList(false, 0)).toBe(false);
  });
});
