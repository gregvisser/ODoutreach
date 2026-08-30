import { describe, expect, it } from "vitest";

import {
  suppressionKindLabel,
  suppressionKindShortLabel,
  suppressionSourceIsConnected,
  suppressionSyncStatusBadgeVariant,
  suppressionSyncStatusLabel,
  suppressionSyncUnavailableCopy,
} from "@/lib/suppression/staff-labels";

describe("Suppression staff labels (PR #138)", () => {
  it("translates kind enums to staff-friendly strings", () => {
    expect(suppressionKindLabel("EMAIL")).toBe("Email addresses");
    expect(suppressionKindLabel("DOMAIN")).toBe("Whole domains");
    expect(suppressionKindLabel("WAT")).toBe("Other source");
  });

  it("provides short labels for table chips", () => {
    expect(suppressionKindShortLabel("EMAIL")).toBe("Emails");
    expect(suppressionKindShortLabel("DOMAIN")).toBe("Domains");
  });

  it("translates sync-status enums to staff-friendly strings", () => {
    expect(suppressionSyncStatusLabel("NOT_CONFIGURED")).toBe("Not connected");
    expect(suppressionSyncStatusLabel("IDLE")).toBe("Connected — never synced");
    expect(suppressionSyncStatusLabel("SYNCING")).toBe("Sync in progress");
    expect(suppressionSyncStatusLabel("SUCCESS")).toBe("Last sync succeeded");
    expect(suppressionSyncStatusLabel("ERROR")).toBe("Last sync failed");
  });

  // Raw enum strings must NEVER be returned by the label helper — the test
  // doubles as a regression guard against "{s.syncStatus}" creeping back in.
  it("never returns the raw Prisma enum string", () => {
    const raws = ["EMAIL", "DOMAIN", "NOT_CONFIGURED", "IDLE", "SYNCING", "SUCCESS", "ERROR"];
    for (const r of raws) {
      expect(suppressionKindLabel(r)).not.toBe(r);
      expect(suppressionSyncStatusLabel(r)).not.toBe(r);
    }
  });

  it("maps sync-status to a sensible badge tone", () => {
    expect(suppressionSyncStatusBadgeVariant("SUCCESS")).toBe("default");
    expect(suppressionSyncStatusBadgeVariant("ERROR")).toBe("destructive");
    expect(suppressionSyncStatusBadgeVariant("SYNCING")).toBe("secondary");
    expect(suppressionSyncStatusBadgeVariant("NOT_CONFIGURED")).toBe("outline");
  });
});

/**
 * Row 111 finding 2 — the Do-not-contact tab showed an amber banner reading
 * "Google Sheets sync isn't set up yet" directly above cards reading "Sheet
 * connected" and "Last sync succeeded". The banner is gated on one GLOBAL
 * credential (the shared service account); "connected" / "succeeded" reflect
 * a PER-CLIENT fact that survives the global credential being removed or
 * rotated out. Same screen, same moment, two different yes/no answers to
 * what reads as the same question. This picks the right banner copy so a
 * client with sync history is told the truth: the credential is currently
 * missing, but the list on screen is real and simply frozen — not "never
 * set up".
 */
describe("suppressionSyncUnavailableCopy (row 111 finding 2)", () => {
  it("tells a client with NO sync history it has never been set up", () => {
    const copy = suppressionSyncUnavailableCopy(false);
    expect(copy.title).toMatch(/isn't set up yet/i);
  });

  it("tells a client with a prior successful sync that the list is frozen, not unset", () => {
    const copy = suppressionSyncUnavailableCopy(true);
    expect(copy.title).not.toMatch(/isn't set up yet/i);
    expect(copy.title).toMatch(/unavailable/i);
    expect(copy.body).toMatch(/frozen/i);
  });

  it("never tells a client with sync history the list was never configured", () => {
    // The literal contradiction Greg would hit: this exact sentence sitting
    // above a card that says "Sheet connected."
    const copy = suppressionSyncUnavailableCopy(true);
    expect(copy.title + " " + copy.body).not.toMatch(/isn't set up yet/i);
  });
});

/**
 * Row 111 finding 3 — the Overview "Do-not-contact" readiness row says "Not
 * configured" using `!!s.spreadsheetId?.trim()` as its test
 * (`client-workspace-bundle.ts:285`), while the Do-not-contact tab's own
 * "Sheet connected." badge used to check only that a source ROW existed, no
 * `spreadsheetId` requirement — two different tests over the same fact, able
 * to legitimately disagree. This is the one test both screens must share.
 */
describe("suppressionSourceIsConnected (row 111 finding 3 — one test, not two)", () => {
  it("is not connected when there is no source row at all", () => {
    expect(suppressionSourceIsConnected(null)).toBe(false);
    expect(suppressionSourceIsConnected(undefined)).toBe(false);
  });

  it("is not connected when a source row exists but its spreadsheetId is blank", () => {
    // The exact gap: a row exists (so the old DNC-tab badge said "Sheet
    // connected"), but there is no working sheet reference (so the Overview
    // panel's `suppressionSheetCount` — same predicate — would not count it).
    expect(suppressionSourceIsConnected({ spreadsheetId: "" })).toBe(false);
    expect(suppressionSourceIsConnected({ spreadsheetId: "   " })).toBe(false);
    expect(suppressionSourceIsConnected({ spreadsheetId: null })).toBe(false);
  });

  it("is connected when the source row has a real spreadsheetId", () => {
    expect(suppressionSourceIsConnected({ spreadsheetId: "abc123" })).toBe(true);
  });
});
