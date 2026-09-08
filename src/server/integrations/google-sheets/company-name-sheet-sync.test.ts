import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ metadata: vi.fn(), values: vi.fn(), source: vi.fn(), apply: vi.fn(), failure: vi.fn(), auth: vi.fn(), limit: vi.fn() }));
vi.mock("googleapis", () => ({ google: { auth: { GoogleAuth: class { constructor(input: unknown) { m.auth(input); } } }, sheets: () => ({ spreadsheets: { get: m.metadata, values: { get: m.values } } }) } }));
vi.mock("@/lib/db", () => ({ prisma: { companyDncSheetSource: { findFirst: m.source } } }));
vi.mock("@/server/suppression/company-name-sheet-source", () => ({ applyCompanySheetRead: m.apply, recordCompanySheetReadFailure: m.failure }));
vi.mock("./auth", () => ({ loadServiceAccountCredentials: () => ({ client_email: "synthetic@example.test" }) }));
vi.mock("./service-account-display", () => ({ getGoogleServiceAccountDisplayInfo: () => ({ clientEmail: "synthetic@example.test" }) }));
vi.mock("./sheets-read-limiter", () => ({ limitSheetsRead: m.limit }));
import { readCompanyNameSheet, syncCompanyNameSheet } from "./company-name-sheet-sync";

beforeEach(() => {
  vi.resetAllMocks();
  m.limit.mockImplementation((read: () => unknown) => read());
  m.metadata.mockResolvedValue({ data: { sheets: [{ properties: { title: "Company's List", gridProperties: { rowCount: 1000 } } }] } });
  m.values.mockResolvedValue({ data: { values: [[], ["Synthetic Company"]] } });
  m.source.mockResolvedValue({ id: "source", revision: 7, spreadsheetId: "synthetic-sheet", tabName: "Company's List" });
  m.apply.mockResolvedValue({ ok: true, added: 1 });
  m.failure.mockImplementation((_id: string, _revision: number, error: string) => ({ ok: false, error }));
});
describe("company Google Sheet reader", () => {
  it("reads only column A of the exact escaped tab with read-only credentials and paced calls", async () => {
    expect(await readCompanyNameSheet("synthetic-sheet", "Company's List")).toEqual([[], ["Synthetic Company"]]);
    expect(m.auth).toHaveBeenCalledWith(expect.objectContaining({ scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"] }));
    expect(m.values).toHaveBeenCalledWith(expect.objectContaining({ range: "'Company''s List'!A:A", majorDimension: "ROWS", valueRenderOption: "FORMATTED_VALUE" }), { timeout: 30_000 });
    expect(m.limit).toHaveBeenCalledTimes(2);
  });
  it("does not fall back to another tab or read values after a metadata failure", async () => {
    await expect(readCompanyNameSheet("synthetic-sheet", "Missing Tab")).rejects.toThrow("configured");
    expect(m.values).not.toHaveBeenCalled();
    m.metadata.mockRejectedValue(Error("quota"));
    await expect(readCompanyNameSheet("synthetic-sheet", "Company's List")).rejects.toThrow("quota");
    expect(m.values).not.toHaveBeenCalled();
  });
  it.each([undefined, 0, 50_001])("refuses missing or oversized sheet row counts: %s", rowCount => {
    m.metadata.mockResolvedValue({ data: { sheets: [{ properties: { title: "Company's List", gridProperties: { rowCount } } }] } });
    return expect(readCompanyNameSheet("synthetic-sheet", "Company's List")).rejects.toThrow("row limit");
  });
  it("carries the fetched source revision and actor to the atomic apply step", async () => {
    expect(await syncCompanyNameSheet("source", "staff")).toMatchObject({ ok: true });
    expect(m.apply).toHaveBeenCalledWith({ sourceId: "source", revision: 7, staffUserId: "staff", values: [[], ["Synthetic Company"]] });
  });
  it("records permission failure against only the read revision and never applies names", async () => {
    m.values.mockRejectedValue(Error("403 forbidden"));
    expect(await syncCompanyNameSheet("source")).toMatchObject({ ok: false, error: expect.stringContaining("Share as Viewer") });
    expect(m.failure).toHaveBeenCalledWith("source", 7, expect.any(String));
    expect(m.apply).not.toHaveBeenCalled();
  });
  it("does not overwrite uncertain database outcomes with a provider-error status", async () => {
    m.apply.mockRejectedValue(Error("database result uncertain"));
    await expect(syncCompanyNameSheet("source")).rejects.toThrow("database result uncertain");
    expect(m.failure).not.toHaveBeenCalled();
  });
});
