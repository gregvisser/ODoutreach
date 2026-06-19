import { describe, expect, it } from "vitest";

import { suppressionShrinkWarning } from "./shrink-warning";

describe("suppressionShrinkWarning", () => {
  it("returns undefined when the list grew or stayed the same", () => {
    expect(suppressionShrinkWarning("EMAIL", 50, 50)).toBeUndefined();
    expect(suppressionShrinkWarning("EMAIL", 80, 50)).toBeUndefined();
    expect(suppressionShrinkWarning("DOMAIN", 0, 0)).toBeUndefined();
  });

  it("warns with the removed count when the email list shrank", () => {
    const w = suppressionShrinkWarning("EMAIL", 50, 1000);
    expect(w).toContain("950");
    expect(w).toContain("addresses");
    expect(w).toContain("were removed");
  });

  it("warns when the sheet was emptied entirely (every block removed)", () => {
    const w = suppressionShrinkWarning("DOMAIN", 0, 200);
    expect(w).toContain("200");
    expect(w).toContain("domains");
  });

  it("uses singular wording for a single removed entry", () => {
    const w = suppressionShrinkWarning("EMAIL", 4, 5);
    expect(w).toContain("1 previously-blocked address ");
    expect(w).toContain("was removed");
  });
});
