import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireOpensDoorsStaff,
  revalidatePath,
  findUnique,
  update,
  commentCreate,
} = vi.hoisted(() => ({
  requireOpensDoorsStaff: vi.fn(),
  revalidatePath: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
  commentCreate: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/server/auth/staff", () => ({ requireOpensDoorsStaff }));
vi.mock("@/lib/db", () => ({
  prisma: {
    supportTicket: { findUnique, update },
    supportTicketComment: { create: commentCreate },
  },
}));

import {
  addSupportTicketComment,
  reopenSupportTicket,
  resolveSupportTicket,
} from "./actions";

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

describe("addSupportTicketComment (row 159 — reply thread)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    commentCreate.mockResolvedValue({ id: "c1" });
  });

  it("rejects a blank reply and never writes a comment", async () => {
    requireOpensDoorsStaff.mockResolvedValue(staffUser);
    const r = await addSupportTicketComment({ ticketId: "t1", body: "" });
    expect(r).toEqual({ ok: false, error: expect.stringContaining("Write something") });
    expect(findUnique).not.toHaveBeenCalled();
    expect(commentCreate).not.toHaveBeenCalled();
  });

  it("rejects a whitespace-only reply", async () => {
    requireOpensDoorsStaff.mockResolvedValue(staffUser);
    const r = await addSupportTicketComment({ ticketId: "t1", body: "   " });
    expect(r.ok).toBe(false);
    expect(commentCreate).not.toHaveBeenCalled();
  });

  it("returns not found for a missing ticket and never writes a comment", async () => {
    requireOpensDoorsStaff.mockResolvedValue(staffUser);
    findUnique.mockResolvedValue(null);
    const r = await addSupportTicketComment({ ticketId: "missing", body: "any update?" });
    expect(r).toEqual({ ok: false, error: expect.stringContaining("not found") });
    expect(commentCreate).not.toHaveBeenCalled();
  });

  it("posts a reply for any signed-in staff, not just the owner", async () => {
    requireOpensDoorsStaff.mockResolvedValue(staffUser);
    findUnique.mockResolvedValue({ id: "t1" });
    const r = await addSupportTicketComment({ ticketId: "t1", body: "Can you attach a screenshot?" });
    expect(r).toEqual({ ok: true });
    expect(commentCreate).toHaveBeenCalledWith({
      data: {
        ticketId: "t1",
        body: "Can you attach a screenshot?",
        authorStaffUserId: staffUser.id,
        authorEmail: staffUser.email,
      },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/support/t1");
  });

  it("trims the reply body before storing it", async () => {
    requireOpensDoorsStaff.mockResolvedValue(owner);
    findUnique.mockResolvedValue({ id: "t1" });
    await addSupportTicketComment({ ticketId: "t1", body: "  fixed the redirect  " });
    expect(commentCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ body: "fixed the redirect" }) }),
    );
  });
});
