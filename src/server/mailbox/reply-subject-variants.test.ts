import { expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({ prisma: {} }));
import { replySubjectVariants } from "./process-synced-replies";
it("handles Outlook separator conversion without changing reference hyphens", () => {
  expect(replySubjectVariants("Delivery check - Example - TEST-09-02")).toEqual([
    "Delivery check - Example - TEST-09-02", "Delivery check – Example – TEST-09-02", "Delivery check — Example — TEST-09-02",
  ]);
});
it("preserves other punctuation, wording and unspaced dashes", () => {
  expect(replySubjectVariants("Re-order A-B: 09/02!")).toEqual(["Re-order A-B: 09/02!"]);
  expect(replySubjectVariants("A—B")).toEqual(["A—B"]);
});
