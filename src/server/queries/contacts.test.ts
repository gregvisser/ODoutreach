import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Queue item 27, defect (9) — "/contacts takes 19,265 ms and ships 2,977 KB of
 * HTML", measured in Chrome on the live site 2026-08-26.
 *
 * `listContactsForStaff` took a bare `take: 500` and returned an array, and the
 * page rendered every element of it. Each rendered row carries a
 * `SendToContactForm` client component, so the document weight is linear in the
 * row count — about 5.9 KB a row, which is where 500 rows becomes 2.9 MB.
 *
 * These tests pin the query. What a person actually SEES is pinned separately
 * and in a real browser by `e2e/contacts-pagination.spec.ts`, because a query
 * that returns 50 rows and a page that still renders everything it is handed
 * would pass this file and fail the screen — and shipping something that passes
 * its tests without firing is the defect this repository has produced six times
 * this week.
 *
 * No DB is touched; prisma is mocked.
 */

const { contactFindMany, contactCount } = vi.hoisted(() => ({
  contactFindMany: vi.fn().mockResolvedValue([]),
  contactCount: vi.fn().mockResolvedValue(0),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    contact: { findMany: contactFindMany, count: contactCount },
  },
}));

import {
  CONTACT_DIRECTORY_PAGE_SIZE,
  listContactsForStaff,
} from "./contacts";

const ACCESSIBLE = ["client-a", "client-b"];

function fakeRows(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `c${i}`,
    clientId: "client-a",
    email: `person${i}@example.test`,
    firstName: null,
    lastName: null,
    fullName: `Person ${i}`,
    linkedIn: null,
    mobilePhone: null,
    officePhone: null,
    source: "CSV_IMPORT",
    isSuppressed: false,
    client: { name: "Alpha Client" },
    importBatch: null,
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  contactFindMany.mockResolvedValue([]);
  contactCount.mockResolvedValue(0);
});

describe("the contact directory is paged, not dumped", () => {
  it("asks the database for one page, not five hundred rows", async () => {
    await listContactsForStaff({ accessibleClientIds: ACCESSIBLE });

    const args = contactFindMany.mock.calls[0]![0];
    // The defect: this was `take: 500` with no skip.
    expect(args.take).toBe(CONTACT_DIRECTORY_PAGE_SIZE);
    expect(args.skip).toBe(0);
  });

  it("reports the real total when the page is truncated", async () => {
    contactFindMany.mockResolvedValue(fakeRows(CONTACT_DIRECTORY_PAGE_SIZE));
    contactCount.mockResolvedValue(30_229);

    const page = await listContactsForStaff({
      accessibleClientIds: ACCESSIBLE,
    });

    expect(page.rows).toHaveLength(CONTACT_DIRECTORY_PAGE_SIZE);
    // Not `rows.length`. A count that claims to be complete is the /suppression
    // defect from the same UX walk, one screen over.
    expect(page.total).toBe(30_229);
    expect(page.pageSize).toBe(CONTACT_DIRECTORY_PAGE_SIZE);
  });

  it("counts with exactly the same where clause it selects with", async () => {
    contactFindMany.mockResolvedValue(fakeRows(3));
    contactCount.mockResolvedValue(3);

    await listContactsForStaff({
      accessibleClientIds: ACCESSIBLE,
      search: "jo",
    });

    const selectWhere = contactFindMany.mock.calls[0]![0].where;
    const countWhere = contactCount.mock.calls[0]![0].where;
    // If these drift, the page shows one set of rows and reports the size of
    // another.
    expect(countWhere).toEqual(selectWhere);
  });

  it("pushes the search into the database, not the browser", async () => {
    await listContactsForStaff({
      accessibleClientIds: ACCESSIBLE,
      search: "  Bianca  ",
    });

    const where = contactFindMany.mock.calls[0]![0].where;
    expect(where.OR).toEqual([
      { email: { contains: "Bianca", mode: "insensitive" } },
      { fullName: { contains: "Bianca", mode: "insensitive" } },
      { firstName: { contains: "Bianca", mode: "insensitive" } },
      { lastName: { contains: "Bianca", mode: "insensitive" } },
    ]);
    // Searching must never widen the tenant scope.
    expect(where.clientId).toEqual({ in: ACCESSIBLE });
  });

  it("orders by a tiebreaker so a row cannot appear on two pages", async () => {
    await listContactsForStaff({ accessibleClientIds: ACCESSIBLE });

    // Contacts imported in one batch share an `updatedAt` to the millisecond.
    // Ordering on that alone lets Postgres return them in any order per query,
    // so page two can repeat page one while another row is never shown at all.
    expect(contactFindMany.mock.calls[0]![0].orderBy).toEqual([
      { updatedAt: "desc" },
      { id: "asc" },
    ]);
  });

  it("applies the offset when paging", async () => {
    await listContactsForStaff({
      accessibleClientIds: ACCESSIBLE,
      offset: 100,
    });

    const args = contactFindMany.mock.calls[0]![0];
    expect(args.skip).toBe(100);
    expect(args.take).toBe(CONTACT_DIRECTORY_PAGE_SIZE);
  });

  it("treats a nonsense offset as the first page", async () => {
    await listContactsForStaff({ accessibleClientIds: ACCESSIBLE, offset: -5 });
    expect(contactFindMany.mock.calls[0]![0].skip).toBe(0);
  });

  it("narrows to a single workspace when one is chosen", async () => {
    await listContactsForStaff({
      accessibleClientIds: ACCESSIBLE,
      filterClientId: "client-b",
    });
    expect(contactFindMany.mock.calls[0]![0].where.clientId).toBe("client-b");
  });

  it("refuses a workspace the staff member cannot access", async () => {
    await expect(
      listContactsForStaff({
        accessibleClientIds: ACCESSIBLE,
        filterClientId: "client-someone-else",
      }),
    ).rejects.toThrow();
    expect(contactFindMany).not.toHaveBeenCalled();
  });

  it("queries nothing at all when the staff member has no workspaces", async () => {
    const page = await listContactsForStaff({ accessibleClientIds: [] });
    expect(page).toEqual({
      rows: [],
      total: 0,
      pageSize: CONTACT_DIRECTORY_PAGE_SIZE,
      offset: 0,
    });
    expect(contactFindMany).not.toHaveBeenCalled();
    expect(contactCount).not.toHaveBeenCalled();
  });

  it("does not fetch the import batch's summary blob", async () => {
    await listContactsForStaff({ accessibleClientIds: ACCESSIBLE });

    const select = contactFindMany.mock.calls[0]![0].select;
    // The screen renders only the file name. `include` used to pull the whole
    // Contact row plus the batch's status and its `summary` JSON.
    expect(select.importBatch).toEqual({ select: { fileName: true } });
    expect(select).not.toHaveProperty("importBatch.select.summary");
  });
});
