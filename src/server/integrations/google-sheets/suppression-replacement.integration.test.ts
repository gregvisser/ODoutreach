import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { closeIntegrationPool, resetIntegrationDatabase } from "@/test/integration/database";

const { valuesGet, refreshFlags } = vi.hoisted(() => ({ valuesGet: vi.fn(), refreshFlags: vi.fn() }));
vi.mock("googleapis", () => ({ google: {
  auth: { GoogleAuth: class {} },
  sheets: () => ({ spreadsheets: { values: { get: valuesGet } } }),
} }));
vi.mock("./auth", () => ({ loadServiceAccountCredentials: () => ({ client_email: "test@example.test", private_key: "synthetic" }) }));
vi.mock("./service-account-display", () => ({ getGoogleServiceAccountDisplayInfo: () => ({ configured: true, clientEmail: "test@example.test" }) }));
vi.mock("./sheets-read-limiter", () => ({ limitSheetsRead: (fn: () => unknown) => fn() }));
vi.mock("@/server/outreach/suppression-guard", () => ({ refreshContactSuppressionFlagsForClient: refreshFlags }));

import { syncSuppressionSourceFromGoogle } from "./suppression-sync";

beforeEach(async () => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("External HTTP forbidden"); }));
  await resetIntegrationDatabase();
  await prisma.client.createMany({ data: ["client", "other"].map((id) => ({ id, name: id, slug: id })) });
});
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });
afterAll(async () => { await prisma.$disconnect(); await closeIntegrationPool(); });

describe.each(["EMAIL", "DOMAIN"] as const)("%s sheet mirror against PostgreSQL", (kind) => {
  const value = (name: string) => kind === "EMAIL" ? `${name}@example.test` : `${name}.example.test`;
  const originals = Array.from({ length: 10 }, (_, i) => value(`old-${i}`));

  async function seed() {
    await prisma.suppressionSource.create({ data: { id: "source", clientId: "client", kind, spreadsheetId: "synthetic-sheet", sheetRange: "'Blocks'!A:A" } });
    const rows = originals.map((entry) => ({ clientId: "client", sourceId: "source", entry }));
    rows.push({ clientId: "other", sourceId: "", entry: value("other") }, { clientId: "client", sourceId: "", entry: value("manual") });
    if (kind === "EMAIL") await prisma.suppressedEmail.createMany({ data: rows.map(({ entry, sourceId, ...row }) => ({ ...row, sourceId: sourceId || null, email: entry })) });
    else await prisma.suppressedDomain.createMany({ data: rows.map(({ entry, sourceId, ...row }) => ({ ...row, sourceId: sourceId || null, domain: entry })) });
    await prisma.companyDncEntry.create({ data: { clientId: "client", originalName: "Kept Company", canonicalName: "kept company" } });
  }

  async function stored() {
    if (kind === "EMAIL") return (await prisma.suppressedEmail.findMany({ where: { sourceId: "source", clientId: "client" } })).map((row) => row.email).sort();
    return (await prisma.suppressedDomain.findMany({ where: { sourceId: "source", clientId: "client" } })).map((row) => row.domain).sort();
  }

  async function removalAudit() {
    return prisma.auditLog.findMany({ where: { clientId: "client", action: "DELETE", entityType: kind === "EMAIL" ? "SuppressedEmail" : "SuppressedDomain" } });
  }

  it("mirrors a shorter sheet, audits the removal, and leaves every other block", async () => {
    await seed();
    const kept = originals.slice(0, 8);
    valuesGet.mockResolvedValue({ data: { values: [...kept, value("added")].map((entry) => [entry]) } });
    const result = await syncSuppressionSourceFromGoogle({ sourceId: "source" });
    expect(result).toMatchObject({ ok: true, rowsWritten: 9, removed: 2 });
    expect(await stored()).toEqual([...kept, value("added")].sort());
    const manual = kind === "EMAIL"
      ? await prisma.suppressedEmail.findMany({ where: { sourceId: null } })
      : await prisma.suppressedDomain.findMany({ where: { sourceId: null } });
    expect(manual.map((row) => row.clientId).sort()).toEqual(["client", "other"]);
    expect(await prisma.companyDncEntry.count({ where: { clientId: "client" } })).toBe(1);
    const audits = await removalAudit();
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ clientId: "client", entityId: "source" });
    expect(audits[0]?.metadata).toMatchObject({
      kind: "sheet_sourced_suppression_removed",
      sourceId: "source",
      spreadsheetId: "synthetic-sheet",
      sheetRange: "'Blocks'!A:A",
      removed: 2,
    });
  });

  it("does not apply an empty sheet or a header with no usable rows", async () => {
    await seed();
    for (const cells of [[], [["Email"]], [["Domain"]]]) {
      valuesGet.mockResolvedValue({ data: { values: cells } });
      const result = await syncSuppressionSourceFromGoogle({ sourceId: "source", confirmShrink: true });
      expect(result).toMatchObject({ ok: false, held: true, removed: 0 });
      expect(await stored()).toEqual([...originals].sort());
      expect(await removalAudit()).toHaveLength(0);
    }
  });

  it("does not write or audit during a dry run of a mirror", async () => {
    await seed();
    valuesGet.mockResolvedValue({ data: { values: [[value("replacement")]] } });
    const result = await syncSuppressionSourceFromGoogle({ sourceId: "source", dryRun: true });
    expect(result).toMatchObject({ ok: true, dryRun: true, wouldWrite: 1, removed: 10 });
    expect(await stored()).toEqual([...originals].sort());
    expect(await removalAudit()).toHaveLength(0);
    expect(refreshFlags).not.toHaveBeenCalled();
  });

  it("keeps a sheet row that is also an unsubscribe, a reply opt-out, or a bounce", async () => {
    if (kind !== "EMAIL") return;
    await seed();
    const optedOut = originals[9]!;
    const replied = originals[8]!;
    const bounced = originals[7]!;
    await prisma.unsubscribeToken.create({ data: { tokenHash: "hash-opt-out", clientId: "client", email: optedOut, usedAt: new Date() } });
    await prisma.inboundReply.create({ data: { clientId: "client", fromEmail: replied, receivedAt: new Date(), classification: "UNSUBSCRIBE" } });
    await prisma.outboundEmail.create({ data: { clientId: "client", toEmail: bounced, status: "BOUNCED" } });
    await prisma.auditLog.create({ data: {
      clientId: "client", action: "CREATE", entityType: "SuppressedDomain",
      metadata: { kind: "manual_do_not_contact_add", value: value("manual") },
    } });
    valuesGet.mockResolvedValue({ data: { values: originals.slice(0, 7).map((entry) => [entry]) } });
    const result = await syncSuppressionSourceFromGoogle({ sourceId: "source" });
    expect(result).toMatchObject({ ok: true, removed: 0 });
    expect(await stored()).toEqual([...originals].sort());
    expect(await removalAudit()).toHaveLength(0);
  });

  it("still removes a sheet row that has no other block when neighbours are protected", async () => {
    if (kind !== "EMAIL") return;
    await seed();
    await prisma.unsubscribeToken.create({ data: { tokenHash: "hash-kept", clientId: "client", email: originals[9]!, usedAt: new Date() } });
    valuesGet.mockResolvedValue({ data: { values: originals.slice(0, 8).map((entry) => [entry]) } });
    const result = await syncSuppressionSourceFromGoogle({ sourceId: "source" });
    expect(result).toMatchObject({ ok: true, removed: 1 });
    expect(await stored()).toEqual([...originals.slice(0, 8), originals[9]].sort());
    expect((await removalAudit())[0]?.metadata).toMatchObject({ removed: 1, keptProtected: 1 });
  });

  it("keeps a manual domain that was also recorded in the audit log", async () => {
    if (kind !== "DOMAIN") return;
    await seed();
    const manualOnSheet = originals[9]!;
    await prisma.suppressedDomain.update({ where: { clientId_domain: { clientId: "client", domain: manualOnSheet } }, data: { sourceId: "source" } });
    await prisma.auditLog.create({ data: {
      clientId: "client", action: "CREATE", entityType: "SuppressedDomain",
      metadata: { kind: "manual_do_not_contact_add", value: manualOnSheet },
    } });
    valuesGet.mockResolvedValue({ data: { values: originals.slice(0, 9).map((entry) => [entry]) } });
    expect(await syncSuppressionSourceFromGoogle({ sourceId: "source" })).toMatchObject({ ok: true, removed: 0 });
    expect(await stored()).toContain(manualOnSheet);
  });

  it("reports a read error and does not change the list", async () => {
    await seed();
    valuesGet.mockRejectedValue(new Error("Unable to parse range: MissingTab!A:A"));
    const result = await syncSuppressionSourceFromGoogle({ sourceId: "source" });
    expect(result.ok).toBe(false);
    expect(result.held).toBe(true);
    expect(result.error).toContain("missing or renamed");
    expect(await stored()).toEqual([...originals].sort());
    expect(await removalAudit()).toHaveLength(0);
  });
});
