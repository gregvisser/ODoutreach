import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Client Sources page copy", () => {
  it("does not explain Universe architecture in the intro", () => {
    const path = join(process.cwd(), "src/app/(app)/clients/[clientId]/sources/page.tsx");
    const src = readFileSync(path, "utf8");
    expect(src).toContain("Import contacts into a named list for this client");
    expect(src).not.toContain("Each import saves people to");
    expect(src).not.toContain("shared across clients");
    expect(src).not.toContain("to pick individuals and build lists for any client");
  });
});
