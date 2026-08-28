import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireOpensDoorsStaff,
  requireClientAccess,
  extractGoogleSpreadsheetId,
  syncSuppressionSourceFromGoogle,
  revalidatePath,
  sourceFindFirst,
  sourceCreate,
  sourceUpdate,
} = vi.hoisted(() => ({
  requireOpensDoorsStaff: vi.fn(),
  requireClientAccess: vi.fn(),
  extractGoogleSpreadsheetId: vi.fn(),
  syncSuppressionSourceFromGoogle: vi.fn(),
  revalidatePath: vi.fn(),
  sourceFindFirst: vi.fn(),
  sourceCreate: vi.fn(),
  sourceUpdate: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/server/auth/staff", () => ({ requireOpensDoorsStaff }));
vi.mock("@/server/tenant/access", () => ({ requireClientAccess }));
vi.mock("@/lib/spreadsheet-url", () => ({ extractGoogleSpreadsheetId }));
vi.mock("@/server/integrations/google-sheets/suppression-sync", () => ({
  syncSuppressionSourceFromGoogle,
}));
vi.mock("@/server/integrations/google-sheets/suppression-sync-errors", () => ({
  SUPPRESSION_SYNC_MESSAGES: { spreadsheetMissing: "missing" },
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    suppressionSource: {
      findFirst: sourceFindFirst,
      create: sourceCreate,
      update: sourceUpdate,
    },
  },
}));

import {
  syncClientEmailSuppressionSourceAction,
  upsertSuppressionSpreadsheetAction,
} from "./client-suppression-source-actions";

// 2026-06-19: the OpensDoors team manages its own suppression sheets, so these
// are available to every active staff member with access to the client (tenant
// guard only). The shrink-sync warning is the safety net against a bad sheet
// edit wiping blocks.
const staffUser = { id: "s2", email: "staff@x.test", isSuperAdmin: false };

describe("upsertSuppressionSpreadsheetAction (all staff with client access)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireOpensDoorsStaff.mockResolvedValue(staffUser);
    requireClientAccess.mockResolvedValue(undefined);
    extractGoogleSpreadsheetId.mockReturnValue("sheet-123");
    sourceFindFirst.mockResolvedValue(null);
    sourceCreate.mockResolvedValue({ id: "src-1" });
  });

  it("lets any staff member connect a sheet (no owner gate)", async () => {
    const r = await upsertSuppressionSpreadsheetAction({
      clientId: "c1",
      kind: "EMAIL",
      urlOrId: "https://docs.google.com/spreadsheets/d/sheet-123",
    });
    expect(r).toEqual({ ok: true });
    expect(sourceCreate).toHaveBeenCalledTimes(1);
  });

  it("still enforces tenant access", async () => {
    requireClientAccess.mockRejectedValueOnce(new Error("no access"));
    const r = await upsertSuppressionSpreadsheetAction({
      clientId: "c1",
      kind: "EMAIL",
      urlOrId: "https://docs.google.com/spreadsheets/d/sheet-123",
    });
    expect(r).toEqual({ ok: false, error: "Access denied." });
    expect(sourceCreate).not.toHaveBeenCalled();
  });
});

// The middle link of the sheet-range chain. The operator-facing half was
// missing entirely until 2026-08-28 (see
// `client-suppression-range-wiring.test.ts`); these pin what the action does
// with the value once a caller finally supplies one.
describe("upsertSuppressionSpreadsheetAction — sheet range", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireOpensDoorsStaff.mockResolvedValue(staffUser);
    requireClientAccess.mockResolvedValue(undefined);
    extractGoogleSpreadsheetId.mockReturnValue("sheet-123");
    sourceFindFirst.mockResolvedValue(null);
    sourceCreate.mockResolvedValue({ id: "src-1" });
    sourceUpdate.mockResolvedValue({ id: "src-1" });
  });

  it("persists the tab the operator typed on a NEW source", async () => {
    const r = await upsertSuppressionSpreadsheetAction({
      clientId: "c1",
      kind: "DOMAIN",
      urlOrId: "sheet-123",
      sheetRange: "Domains!A:A",
    });
    expect(r).toEqual({ ok: true });
    expect(sourceCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sheetRange: "Domains!A:A" }),
      }),
    );
  });

  it("persists the tab on an EXISTING source", async () => {
    sourceFindFirst.mockResolvedValue({ id: "src-1", sheetRange: null });
    await upsertSuppressionSpreadsheetAction({
      clientId: "c1",
      kind: "DOMAIN",
      urlOrId: "sheet-123",
      sheetRange: "  Domains!A:A  ",
    });
    expect(sourceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sheetRange: "Domains!A:A" }),
      }),
    );
  });

  it("does NOT wipe a saved range when the field is omitted entirely", async () => {
    // Adding the input created a new way to lose data: any caller that saves a
    // URL without echoing the range back would null a working range and send
    // the client silently back to Sheet1 — the exact outage being fixed.
    sourceFindFirst.mockResolvedValue({ id: "src-1", sheetRange: "Domains!A:A" });
    await upsertSuppressionSpreadsheetAction({
      clientId: "c1",
      kind: "DOMAIN",
      urlOrId: "sheet-456",
    });
    // Leaving the column out of `data` is how the saved value survives — an
    // explicit `sheetRange: null` (what this used to send) is the wipe.
    const data = (sourceUpdate.mock.calls[0]?.[0] as { data: object }).data;
    expect(data).not.toHaveProperty("sheetRange");
    expect(data).toMatchObject({ spreadsheetId: "sheet-123" });
  });

  it("clears the range when the operator deliberately empties the box", async () => {
    // An explicit empty string is a choice — "go back to the default" — and
    // must be distinguishable from the field being absent.
    sourceFindFirst.mockResolvedValue({ id: "src-1", sheetRange: "Domains!A:A" });
    await upsertSuppressionSpreadsheetAction({
      clientId: "c1",
      kind: "DOMAIN",
      urlOrId: "sheet-123",
      sheetRange: "   ",
    });
    expect(sourceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sheetRange: null }),
      }),
    );
  });

  it("refuses an absurdly long range rather than storing it", async () => {
    const r = await upsertSuppressionSpreadsheetAction({
      clientId: "c1",
      kind: "DOMAIN",
      urlOrId: "sheet-123",
      sheetRange: "A".repeat(300),
    });
    expect(r).toEqual({ ok: false, error: "Invalid suppression form." });
    expect(sourceCreate).not.toHaveBeenCalled();
  });
});

describe("syncClientEmailSuppressionSourceAction (all staff with client access)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireOpensDoorsStaff.mockResolvedValue(staffUser);
    requireClientAccess.mockResolvedValue(undefined);
    sourceFindFirst.mockResolvedValue({ id: "src-1", spreadsheetId: "sheet-123" });
    syncSuppressionSourceFromGoogle.mockResolvedValue({ ok: true, rowsWritten: 5 });
  });

  it("lets any staff member sync", async () => {
    const r = await syncClientEmailSuppressionSourceAction("c1");
    expect(r).toMatchObject({ ok: true, rowsWritten: 5 });
    expect(syncSuppressionSourceFromGoogle).toHaveBeenCalledWith({ sourceId: "src-1" });
  });

  it("still enforces tenant access", async () => {
    requireClientAccess.mockRejectedValueOnce(new Error("no access"));
    const r = await syncClientEmailSuppressionSourceAction("c1");
    expect(r).toEqual({ ok: false, error: "Access denied." });
    expect(syncSuppressionSourceFromGoogle).not.toHaveBeenCalled();
  });
});
