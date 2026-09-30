import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function read(...segments: string[]): string {
  return readFileSync(join(process.cwd(), ...segments), "utf8");
}

describe("StaleBuildGuard wiring", () => {
  it("is mounted from the root layout so every staff surface is covered", () => {
    const layout = read("src", "app", "layout.tsx");
    expect(layout).toContain("StaleBuildGuard");
    expect(layout).toMatch(/from "@\/components\/providers\/stale-build-guard"/);
  });

  it("polls /api/build-info and listens for deploy skew globally", () => {
    const guard = read("src", "components", "providers", "stale-build-guard.tsx");
    expect(guard).toContain("fetchLiveBuildInfo");
    expect(guard).toContain("unhandledrejection");
    expect(guard).toContain("confirmReloadWithDirtyForms");
    expect(guard).toContain("window.location.reload");
  });
});
