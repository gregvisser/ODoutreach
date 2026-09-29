import { describe, expect, it } from "vitest";
import { automaticSourceOrigin, universeHarvestOrigin } from "./rocketreach-origin";

describe("automaticSourceOrigin", () => {
  it("names the plan and the London calendar date", () => {
    expect(automaticSourceOrigin("Northern directors", new Date("2026-10-01T23:30:00.000Z"))).toBe(
      "Sourced automatically from plan Northern directors on 02 Oct 2026",
    );
    expect(automaticSourceOrigin("  Line\none  ", new Date("2026-09-29T10:00:00.000Z"))).toBe(
      "Sourced automatically from plan Line one on 29 Sep 2026",
    );
    expect(universeHarvestOrigin(new Date("2026-09-29T10:00:00.000Z"))).toBe(
      "Re-harvested from Universe on 29 Sep 2026",
    );
  });
});
