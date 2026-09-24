import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(join(process.cwd(), "src/components/ai/ai-badge.tsx"), "utf8");

describe("AiBadge", () => {
  it("uses the Sparkles icon with a shared accessible name and colour", () => {
    expect(source).toContain('from "lucide-react"');
    expect(source).toContain("Sparkles");
    expect(source).toContain('aria-label="AI"');
    expect(source).toContain("text-primary");
    expect(source).toContain("size-4");
  });

  it("exports the badge, the icon, and the classification badge", () => {
    expect(source).toContain("export function AiIcon");
    expect(source).toContain("export function AiBadge");
    expect(source).toContain("export function AiClassificationBadge");
  });
});
