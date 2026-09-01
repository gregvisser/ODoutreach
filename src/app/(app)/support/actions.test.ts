import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireOpensDoorsStaff, revalidatePath, findUnique, update } =
  vi.hoisted(() => ({
    requireOpensDoorsStaff: vi.fn(),
    revalidatePath: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  }));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/server/auth/staff", () => ({ requireOpensDoorsStaff }));
vi.mock("@/lib/db", () => ({
  prisma: { supportTicket: { findUnique, update } },
}));

import { reopenSupportTicket, resolveSupportTicket } from "./actions";

const owner = { id: "s1", email: "owner@x.test", isSuperAdmin: true };
const staffUser = { id: "s2", email: "staff@x.test", isSuperAdmin: false };

describe("resolveSupportTicket (owner-only + status guard)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    update.mockResolvedValue({ id: "t1" });
  });

  it("rejects non-owner staff and never reads or writes the ticket", async () => {
    requireOpensDoorsStaff.mockResolvedValue(staffUser);
    const r = await resolveSupportTicket({ ticketId: "t1", resolutionNote: "x" });
    expect(r).toEqual({ ok: false, error: expect.stringContaining("owner") });
    expect(findUnique).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("resolves an open ticket for the owner", async () => {
    requireOpensDoorsStaff.mockResolvedValue(owner);
    findUnique.mockResolvedValue({ id: "t1", status: "OPEN" });
    const r = await resolveSupportTicket({ ticketId: "t1", resolutionNote: "fixed the bug" });
    expect(r).toEqual({ ok: true });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "t1" },
        data: expect.objectContaining({ status: "RESOLVED" }),
      }),
    );
  });

  it("rejects a blank resolution note and never touches the ticket (row 156)", async () => {
    requireOpensDoorsStaff.mockResolvedValue(owner);
    findUnique.mockResolvedValue({ id: "t1", status: "OPEN" });
    const r = await resolveSupportTicket({ ticketId: "t1", resolutionNote: "" });
    expect(r).toEqual({
      ok: false,
      error: expect.stringContaining("at least 10 characters"),
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects a whitespace-only resolution note (row 156)", async () => {
    requireOpensDoorsStaff.mockResolvedValue(owner);
    findUnique.mockResolvedValue({ id: "t1", status: "OPEN" });
    const r = await resolveSupportTicket({ ticketId: "t1", resolutionNote: "       " });
    expect(r.ok).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects a too-short resolution note (row 156)", async () => {
    requireOpensDoorsStaff.mockResolvedValue(owner);
    findUnique.mockResolvedValue({ id: "t1", status: "OPEN" });
    const r = await resolveSupportTicket({ ticketId: "t1", resolutionNote: "fixed it" });
    expect(r.ok).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it("refuses to re-resolve an already-resolved ticket (the audit's missing status guard)", async () => {
    requireOpensDoorsStaff.mockResolvedValue(owner);
    findUnique.mockResolvedValue({ id: "t1", status: "RESOLVED" });
    const r = await resolveSupportTicket({ ticketId: "t1", resolutionNote: "again" });
    expect(r).toEqual({
      ok: false,
      error: expect.stringContaining("already resolved"),
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("returns not found for a missing ticket", async () => {
    requireOpensDoorsStaff.mockResolvedValue(owner);
    findUnique.mockResolvedValue(null);
    const r = await resolveSupportTicket({ ticketId: "missing", resolutionNote: "x" });
    expect(r).toEqual({ ok: false, error: expect.stringContaining("not found") });
    expect(update).not.toHaveBeenCalled();
  });
});

describe("reopenSupportTicket (owner-only + status guard)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    update.mockResolvedValue({ id: "t1" });
  });

  it("rejects non-owner staff", async () => {
    requireOpensDoorsStaff.mockResolvedValue(staffUser);
    const r = await reopenSupportTicket({ ticketId: "t1" });
    expect(r).toEqual({ ok: false, error: expect.stringContaining("owner") });
    expect(update).not.toHaveBeenCalled();
  });

  it("reopens a resolved ticket and clears the resolution", async () => {
    requireOpensDoorsStaff.mockResolvedValue(owner);
    findUnique.mockResolvedValue({ id: "t1", status: "RESOLVED" });
    const r = await reopenSupportTicket({ ticketId: "t1" });
    expect(r).toEqual({ ok: true });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "OPEN",
          resolvedAt: null,
          resolutionNote: null,
        }),
      }),
    );
  });

  it("refuses to reopen a ticket that isn't resolved", async () => {
    requireOpensDoorsStaff.mockResolvedValue(owner);
    findUnique.mockResolvedValue({ id: "t1", status: "OPEN" });
    const r = await reopenSupportTicket({ ticketId: "t1" });
    expect(r).toEqual({ ok: false, error: expect.stringContaining("resolved") });
    expect(update).not.toHaveBeenCalled();
  });
});
