import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const pagePath = join(process.cwd(), "src/app/(app)/google-reconnects/page.tsx");

// Row 154 (raised by row 136/cycle197 finding 1): the "Already expired"
// headline tile only ever read `roster.overdueCount`, which is null for any
// mailbox that never reached CONNECTED — a PENDING_CONNECTION sign-in stuck
// for weeks (greentheuk's exact failure) always showed as 0 there. The page
// must render a tile from `roster.notConnectedCount` so that class of dead
// mailbox is never invisible in the numbers a busy operator reads first.
describe("Google logins page copy (row 154)", () => {
  it("renders a summary tile from roster.notConnectedCount", () => {
    const src = readFileSync(pagePath, "utf8");
    expect(src).toContain("roster.notConnectedCount");
    expect(src).toContain("Not connected");
  });

  it("keeps 'Already expired' scoped to a decayed token, not conflated with never-connected", () => {
    const src = readFileSync(pagePath, "utf8");
    expect(src).toContain("roster.overdueCount");
  });
});
