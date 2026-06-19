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
