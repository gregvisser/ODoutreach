import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * PR #138 — Do-not-contact page copy / no-raw-enum policy.
 *
 * The user reported the suppression UI was confusing: cards showed raw
 * Prisma enum strings ("EMAIL", "DOMAIN", "NOT_CONFIGURED", "IDLE", ...) and
 * the page heading read "Do-not-contact monitor" rather than something
 * staff-friendly. This test locks the cleaned copy + no-raw-enum rule.
 */

const globalPagePath = join(process.cwd(), "src/app/(app)/suppression/page.tsx");
const clientPagePath = join(
  process.cwd(),
  "src/app/(app)/clients/[clientId]/suppression/page.tsx",
);
const clientCardPath = join(
  process.cwd(),
  "src/components/clients/client-suppression-inline-card.tsx",
);

const globalPageSource = readFileSync(globalPagePath, "utf8");
const clientPageSource = readFileSync(clientPagePath, "utf8");
const clientCardSource = readFileSync(clientCardPath, "utf8");

describe("Do-not-contact pages — staff-friendly copy", () => {
  it("uses 'People blocked from outreach' as the global page heading", () => {
    expect(globalPageSource).toContain("People blocked from outreach");
    expect(globalPageSource).not.toContain("Do-not-contact monitor");
  });

  it("uses the per-client heading 'People blocked from outreach — {client.name}'", () => {
    expect(clientPageSource).toContain("People blocked from outreach");
  });

  it("explains the four sources of suppression on the global page", () => {
    // Manual lists, unsubscribes, bounces, per-client rules.
    expect(globalPageSource).toContain("Manual lists");
    expect(globalPageSource).toContain("Unsubscribes");
    expect(globalPageSource).toContain("Bounces");
    expect(globalPageSource).toContain("Per-client safety rules");
  });

  it("renders kind + sync-status through the staff label helpers", () => {
    expect(globalPageSource).toContain("suppressionKindLabel");
    expect(globalPageSource).toContain("suppressionSyncStatusLabel");
    expect(clientCardSource).toContain("suppressionKindShortLabel");
    expect(clientCardSource).toContain("suppressionSyncStatusLabel");
  });

  it("does not dump raw Prisma enum values into the JSX of staff pages", () => {
    // Raw enum chips like `{s.syncStatus}` or `{s.kind}` shipped to staff are
    // the regression we're guarding against.
    expect(globalPageSource).not.toContain("{s.syncStatus}");
    expect(globalPageSource).not.toContain(">EMAIL<");
    expect(globalPageSource).not.toContain(">DOMAIN<");
    expect(clientCardSource).not.toContain("{s.kind} · {s.syncStatus}");
  });

  it("shows staff-friendly empty states (no random dev copy)", () => {
    expect(globalPageSource).toContain(
      "No do-not-contact sheets connected yet",
    );
  });
});
