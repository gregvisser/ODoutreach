import { describe, expect, it } from "vitest";

import { normalizeTaxonomyLabel } from "./brief-taxonomy";

describe("normalizeTaxonomyLabel", () => {
  it("trims and lowercases the key", () => {
    expect(normalizeTaxonomyLabel("  Hello   World  ")).toEqual({
      key: "hello world",
      display: "Hello World",
    });
  });
});
