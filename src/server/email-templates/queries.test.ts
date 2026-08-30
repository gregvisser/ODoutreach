import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Row 130 — "archived rows keep accumulating in the same list forever."
 * Drives the REAL `loadClientEmailTemplatesOverview` against a mocked
 * Prisma client and proves archived templates are absent from the default
 * `templates` array, while `counts`/`archivedCount` still report the full
 * picture so the screen can say how many are hidden.
 */

const { findManyMock } = vi.hoisted(() => ({
  findManyMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    clientEmailTemplate: {
      findMany: findManyMock,
    },
  },
}));

const { loadClientEmailTemplatesOverview } = await import("./queries");

const CLIENT_ID = "client_1";

function row(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: overrides.id ?? "tmpl_1",
    clientId: CLIENT_ID,
    name: overrides.name ?? "A template",
    category: "INTRODUCTION",
    status: overrides.status ?? "APPROVED",
    subject: "Subject",
    content: "Content",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    approvedAt: null,
    archivedAt: overrides.status === "ARCHIVED" ? new Date() : null,
    createdBy: null,
    approvedBy: null,
    _count: { sequenceSteps: 0, sequenceStepSends: 0 },
    ...overrides,
  };
}

beforeEach(() => {
  findManyMock.mockReset();
});

describe("loadClientEmailTemplatesOverview", () => {
  it("excludes ARCHIVED rows from the default (working) list", async () => {
    findManyMock.mockResolvedValue([
      row({ id: "draft", status: "DRAFT" }),
      row({ id: "approved", status: "APPROVED" }),
      row({ id: "archived-1", status: "ARCHIVED" }),
      row({ id: "archived-2", status: "ARCHIVED" }),
    ]);

    const overview = await loadClientEmailTemplatesOverview(CLIENT_ID);

    expect(overview.templates.map((t) => t.id).sort()).toEqual([
      "approved",
      "draft",
    ]);
    expect(overview.templates.some((t) => t.status === "ARCHIVED")).toBe(
      false,
    );
    // Hidden count is still reported so the screen can say how many are hidden.
    expect(overview.archivedCount).toBe(2);
    expect(overview.counts.byStatus.ARCHIVED).toBe(2);
    expect(overview.counts.total).toBe(4);
  });

  it("includes ARCHIVED rows when includeArchived is requested", async () => {
    findManyMock.mockResolvedValue([
      row({ id: "draft", status: "DRAFT" }),
      row({ id: "archived-1", status: "ARCHIVED" }),
    ]);

    const overview = await loadClientEmailTemplatesOverview(CLIENT_ID, {
      includeArchived: true,
    });

    expect(overview.templates.map((t) => t.id).sort()).toEqual([
      "archived-1",
      "draft",
    ]);
    expect(overview.archivedCount).toBe(1);
  });

  it("marks a never-used template deletable and a used one not, with a readable reason", async () => {
    findManyMock.mockResolvedValue([
      row({
        id: "unused",
        status: "ARCHIVED",
        _count: { sequenceSteps: 0, sequenceStepSends: 0 },
      }),
      row({
        id: "used",
        status: "ARCHIVED",
        _count: { sequenceSteps: 1, sequenceStepSends: 0 },
      }),
    ]);

    const overview = await loadClientEmailTemplatesOverview(CLIENT_ID, {
      includeArchived: true,
    });

    const unused = overview.templates.find((t) => t.id === "unused");
    const used = overview.templates.find((t) => t.id === "used");
    expect(unused?.canDelete).toBe(true);
    expect(unused?.deleteBlockedReason).toBeNull();
    expect(used?.canDelete).toBe(false);
    expect(used?.deleteBlockedReason).toContain("sequence step");
  });

  it("returns an empty overview without querying when clientId is blank", async () => {
    const overview = await loadClientEmailTemplatesOverview("");
    expect(overview).toEqual({
      templates: [],
      counts: expect.objectContaining({ total: 0 }),
      archivedCount: 0,
    });
    expect(findManyMock).not.toHaveBeenCalled();
  });
});
