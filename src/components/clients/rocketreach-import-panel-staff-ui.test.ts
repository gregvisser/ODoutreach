import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("RocketReachImportPanel — staff vs admin UI", () => {
  const path = join(process.cwd(), "src/components/clients/rocketreach-import-panel.tsx");
  const src = readFileSync(path, "utf8");

  it("gates advanced JSON on allowAdvancedRocketReachJson", () => {
    expect(src).toContain("allowAdvancedRocketReachJson");
    expect(src).toContain("Advanced JSON (admin only)");
  });

  it("does not render advanced JSON for staff by default", () => {
    expect(src).toContain("allowAdvancedRocketReachJson = false");
  });

  it("surfaces list-import guidance for staff", () => {
    expect(src).toContain("RocketReach list import");
    expect(src).toContain("ROCKETREACH_LIST_IMPORT_STAFF_FALLBACK");
  });
});
