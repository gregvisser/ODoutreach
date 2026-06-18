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

const owner = { id: "s1", email: "owner@x.test", isSuperAdmin: true };
const staffUser = { id: "s2", email: "staff@x.test", isSuperAdmin: false };

describe("upsertSuppressionSpreadsheetAction (owner-only re-point)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireClientAccess.mockResolvedValue(undefined);
    extractGoogleSpreadsheetId.mockReturnValue("sheet-123");
    sourceFindFirst.mockResolvedValue(null);
    sourceCreate.mockResolvedValue({ id: "src-1" });
  });

  it("rejects a non-owner before touching the sheet config", async () => {
    requireOpensDoorsStaff.mockResolvedValue(staffUser);
    const r = await upsertSuppressionSpreadsheetAction({
      clientId: "c1",
      kind: "EMAIL",
      urlOrId: "https://docs.google.com/spreadsheets/d/sheet-123",
    });
    expect(r).toEqual({ ok: false, error: expect.stringContaining("owner") });
    expect(extractGoogleSpreadsheetId).not.toHaveBeenCalled();
    expect(sourceCreate).not.toHaveBeenCalled();
    expect(sourceUpdate).not.toHaveBeenCalled();
  });

  it("lets the owner connect a sheet", async () => {
    requireOpensDoorsStaff.mockResolvedValue(owner);
    const r = await upsertSuppressionSpreadsheetAction({
      clientId: "c1",
      kind: "EMAIL",
      urlOrId: "https://docs.google.com/spreadsheets/d/sheet-123",
    });
    expect(r).toEqual({ ok: true });
    expect(sourceCreate).toHaveBeenCalledTimes(1);
  });
});

describe("syncClientEmailSuppressionSourceAction (owner-only sync)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireClientAccess.mockResolvedValue(undefined);
    sourceFindFirst.mockResolvedValue({ id: "src-1", spreadsheetId: "sheet-123" });
    syncSuppressionSourceFromGoogle.mockResolvedValue({ ok: true, rowsWritten: 5 });
  });

  it("rejects a non-owner before running the delete-then-replace sync", async () => {
    requireOpensDoorsStaff.mockResolvedValue(staffUser);
    const r = await syncClientEmailSuppressionSourceAction("c1");
    expect(r).toEqual({ ok: false, error: expect.stringContaining("owner") });
    expect(sourceFindFirst).not.toHaveBeenCalled();
    expect(syncSuppressionSourceFromGoogle).not.toHaveBeenCalled();
  });

  it("lets the owner sync", async () => {
    requireOpensDoorsStaff.mockResolvedValue(owner);
    const r = await syncClientEmailSuppressionSourceAction("c1");
    expect(r).toMatchObject({ ok: true, rowsWritten: 5 });
    expect(syncSuppressionSourceFromGoogle).toHaveBeenCalledWith({ sourceId: "src-1" });
  });
});
