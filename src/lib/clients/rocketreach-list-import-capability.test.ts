import { describe, expect, it } from "vitest";

import {
  ROCKETREACH_LIST_IMPORT_STAFF_FALLBACK,
  ROCKETREACH_SAVED_LIST_IMPORT_SUPPORTED,
} from "./rocketreach-list-import-capability";

describe("RocketReach list import capability (declared scope)", () => {
  it("documents that saved-list import is not wired yet", () => {
    expect(ROCKETREACH_SAVED_LIST_IMPORT_SUPPORTED).toBe(false);
    expect(ROCKETREACH_LIST_IMPORT_STAFF_FALLBACK).toContain("CSV");
  });
});
