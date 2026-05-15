import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const pagePath = join(
  process.cwd(),
  "src/app/(app)/clients/[clientId]/contacts/page.tsx",
);
const pageSource = readFileSync(pagePath, "utf8");

describe("Client Lists tab (PR #138)", () => {
  it("renames the page heading to 'Lists & readiness'", () => {
    expect(pageSource).toContain("Lists &amp; readiness");
  });

  it("uses 'Lists' (not 'Contacts') as the eyebrow label", () => {
    expect(pageSource).toMatch(/Lists\s*\n\s*<\/p>/);
  });

  it("links each list card to /clients/[id]/lists/[listId]", () => {
    expect(pageSource).toContain("`${base}/lists/${list.id}`");
    expect(pageSource).toContain("Open list");
  });

  it("points staff at Sources for adding contacts", () => {
    expect(pageSource).toContain("To add people use");
  });
});
