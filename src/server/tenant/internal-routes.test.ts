import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function routeFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...routeFiles(full));
    } else if (entry === "route.ts") {
      found.push(full);
    }
  }
  return found;
}

describe("internal job routes stay behind the queue secret", () => {
  const files = routeFiles(path.join(process.cwd(), "src/app/api/internal"));

  it("finds the job routes", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it("each route refuses a caller who does not present PROCESS_QUEUE_SECRET", () => {
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source, file).toContain("PROCESS_QUEUE_SECRET");
      expect(source, file).toContain("Bearer");
      expect(source, file).toMatch(/status:\s*401/);
    }
  });
});
