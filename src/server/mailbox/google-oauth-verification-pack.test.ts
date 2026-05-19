import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const DOC_PATH = join(
  process.cwd(),
  "docs/ops/GOOGLE_OAUTH_VERIFICATION_PACK.md",
);

describe("Google OAuth verification pack", () => {
  it("exists and documents the current Gmail scopes", () => {
    expect(existsSync(DOC_PATH)).toBe(true);
    const doc = readFileSync(DOC_PATH, "utf8");
    expect(doc).toContain("https://www.googleapis.com/auth/gmail.send");
    expect(doc).toContain("https://www.googleapis.com/auth/gmail.readonly");
    expect(doc).toContain("ODoutreach does not request `https://mail.google.com/`");
  });

  it("covers reviewer, privacy, demo, and test-user guidance", () => {
    const doc = readFileSync(DOC_PATH, "utf8");
    expect(doc).toContain("OAuth consent screen values");
    expect(doc).toContain("Verification demo-video script");
    expect(doc).toContain("Privacy policy checklist");
    expect(doc).toContain("Google reviewer explanation");
    expect(doc).toContain("Emergency test-user procedure");
  });
});
