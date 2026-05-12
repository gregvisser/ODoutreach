import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  findFirst: vi.fn(),
  update: vi.fn(),
  del: vi.fn(),
  seqCount: vi.fn(),
  enrollCount: vi.fn(),
  stepCount: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    contactList: { findFirst: m.findFirst, update: m.update, delete: m.del },
    clientEmailSequence: { count: m.seqCount },
    clientEmailSequenceEnrollment: { count: m.enrollCount },
    clientEmailSequenceStepSend: { count: m.stepCount },
  },
}));

import { deleteOrArchiveClientContactList } from "./contact-lists";

describe("deleteOrArchiveClientContactList", () => {
  beforeEach(() => {
    m.findFirst.mockReset();
    m.update.mockReset();
    m.del.mockReset();
    m.seqCount.mockReset();
    m.enrollCount.mockReset();
    m.stepCount.mockReset();
  });

  it("hard-deletes when no sequence references exist", async () => {
    m.findFirst.mockResolvedValueOnce({ id: "list-1", archivedAt: null });
    m.seqCount.mockResolvedValueOnce(0);
    m.enrollCount.mockResolvedValueOnce(0);
    m.stepCount.mockResolvedValueOnce(0);
    m.del.mockResolvedValueOnce({});

    const r = await deleteOrArchiveClientContactList({
      clientId: "c1",
      listId: "list-1",
    });
    expect(r).toEqual({ ok: true, mode: "deleted" });
    expect(m.del).toHaveBeenCalledWith({ where: { id: "list-1" } });
    expect(m.update).not.toHaveBeenCalled();
  });

  it("archives when a sequence references the list", async () => {
    m.findFirst.mockResolvedValueOnce({ id: "list-1", archivedAt: null });
    m.seqCount.mockResolvedValueOnce(1);
    m.enrollCount.mockResolvedValueOnce(0);
    m.stepCount.mockResolvedValueOnce(0);
    m.update.mockResolvedValueOnce({});

    const r = await deleteOrArchiveClientContactList({
      clientId: "c1",
      listId: "list-1",
    });
    expect(r.ok).toBe(true);
    if (r.ok && r.mode === "archived") {
      expect(r.message).toMatch(/archived instead of permanently deleted/);
    }
    expect(m.update).toHaveBeenCalled();
    expect(m.del).not.toHaveBeenCalled();
  });

  it("returns error when list is already archived", async () => {
    m.findFirst.mockResolvedValueOnce({ id: "list-1", archivedAt: new Date() });
    const r = await deleteOrArchiveClientContactList({
      clientId: "c1",
      listId: "list-1",
    });
    expect(r).toEqual({ ok: false, error: "This list is already archived." });
  });
});
