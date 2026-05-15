import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("RocketReachImportPanel — staff vs admin UI", () => {
  const path = join(process.cwd(), "src/components/clients/rocketreach-import-panel.tsx");
  const src = readFileSync(path, "utf8");

  it("gates advanced JSON on allowAdvancedRocketReachJson prop (server sets from ROCKETREACH_IMPORT_JSON_DEBUG)", () => {
    expect(src).toContain("allowAdvancedRocketReachJson");
    expect(src).toContain("Advanced JSON (debug only)");
  });

  // PR #138 — the in-app search is no longer hidden inside a collapsed
  // <details>. It now renders as a visible section ("Search prospects on
  // RocketReach") and the credit warning lives inside that section, above
  // the form fields. The confirmation phrase + credit copy must still
  // surround the search controls so live searches can't run without them.
  it("renders the credit warning above the visible in-app search section", () => {
    expect(src).toMatch(
      /aria-label="RocketReach prospect search"[\s\S]*RocketReach may use credits/,
    );
    expect(src).toMatch(
      /RocketReach may use credits[\s\S]*ROCKETREACH_IMPORT_CONFIRMATION_PHRASE/,
    );
  });

  it("does not render advanced JSON for staff by default", () => {
    expect(src).toContain("allowAdvancedRocketReachJson = false");
  });

  it("surfaces RocketReach list guidance for staff", () => {
    expect(src).toContain("Lists you build in RocketReach");
    expect(src).toContain("ROCKETREACH_LIST_IMPORT_STAFF_FALLBACK");
  });
});
