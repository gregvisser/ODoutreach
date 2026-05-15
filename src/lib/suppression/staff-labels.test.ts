import { describe, expect, it } from "vitest";

import {
  suppressionKindLabel,
  suppressionKindShortLabel,
  suppressionSyncStatusBadgeVariant,
  suppressionSyncStatusLabel,
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
