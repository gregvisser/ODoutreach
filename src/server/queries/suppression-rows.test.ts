import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Queue item 27 (7) — "/suppression says 'Showing 200 of 200' while silently
 * truncating."
 *
 * Two separate defects lived behind that sentence, and only the first one is
 * cosmetic:
 *
 *   1. The row queries took a bare `take: 200` and returned an array. The page
 *      had no idea how many rows really existed, so the table printed
 *      `rows.length` on BOTH sides of "of" — "Showing 200 of 200" against a
 *      client with 30,229 blocked addresses. The count did not merely omit the
 *      rest, it claimed there was no rest.
 *
 *   2. The Search box filtered the 200 rows already in the browser. On a
 *      do-not-contact screen that is a safety defect, not a UI one: a staff
 *      member checking "is this person blocked?" was told "No emails match the
 *      current filters" for someone who IS blocked, because the address was
 *      simply not in the arbitrary window that had been loaded.
 *
 * These tests pin the fix at the layer that has to be right — the query — and
 * assert the tenant wall is still standing once a search term is added to the
 * where clause. No DB is touched; prisma is mocked.
 */

const {
  emailFindMany,
  emailCount,
  domainFindMany,
  domainCount,
  sourceFindMany,
} = vi.hoisted(() => ({
  emailFindMany: vi.fn().mockResolvedValue([]),
  emailCount: vi.fn().mockResolvedValue(0),
  domainFindMany: vi.fn().mockResolvedValue([]),
  domainCount: vi.fn().mockResolvedValue(0),
  sourceFindMany: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    suppressedEmail: { findMany: emailFindMany, count: emailCount },
    suppressedDomain: { findMany: domainFindMany, count: domainCount },
    suppressionSource: { findMany: sourceFindMany },
  },
}));

import {
  SUPPRESSION_ROW_PAGE_SIZE,
  listSuppressedDomainsForStaff,
  listSuppressedEmailsForStaff,
} from "./suppression";
import { describeRowWindow } from "@/lib/suppression/row-window";

const ACCESSIBLE = ["client-a", "client-b"];

function fakeEmailRows(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `e${i}`,
    email: `person${i}@example.test`,
    client: { name: "Alpha Client" },
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  emailFindMany.mockResolvedValue([]);
  emailCount.mockResolvedValue(0);
  domainFindMany.mockResolvedValue([]);
  domainCount.mockResolvedValue(0);
});

describe("blocked-contact row queries report the real total", () => {
  it("returns the true row count when the page is truncated", async () => {
    // A client the size of Panda Recycling: far more rows than one page.
    emailFindMany.mockResolvedValue(fakeEmailRows(SUPPRESSION_ROW_PAGE_SIZE));
    emailCount.mockResolvedValue(30_229);

    const page = await listSuppressedEmailsForStaff({
      accessibleClientIds: ACCESSIBLE,
    });

    expect(page.rows).toHaveLength(SUPPRESSION_ROW_PAGE_SIZE);
    // The defect: this used to be 200, because the page could only see
    // `rows.length`.
    expect(page.total).toBe(30_229);
    expect(page.pageSize).toBe(SUPPRESSION_ROW_PAGE_SIZE);
    expect(page.offset).toBe(0);
  });

  it("counts with exactly the same where clause it selects with", async () => {
    emailFindMany.mockResolvedValue(fakeEmailRows(3));
    emailCount.mockResolvedValue(3);

    await listSuppressedEmailsForStaff({
      accessibleClientIds: ACCESSIBLE,
      search: "jo",
    });

    const selectWhere = emailFindMany.mock.calls[0][0].where;
    const countWhere = emailCount.mock.calls[0][0].where;
    // If these ever drift, the total describes a different set of rows than
    // the table shows — which is the bug this file exists to prevent.
    expect(countWhere).toEqual(selectWhere);
  });

  it("orders alphabetically so the window is explicable, not arbitrary", async () => {
    await listSuppressedEmailsForStaff({ accessibleClientIds: ACCESSIBLE });
    expect(emailFindMany.mock.calls[0][0].orderBy).toEqual([{ email: "asc" }]);

    await listSuppressedDomainsForStaff({ accessibleClientIds: ACCESSIBLE });
    expect(domainFindMany.mock.calls[0][0].orderBy).toEqual([{ domain: "asc" }]);
  });

  it("pages through the rest of the rows", async () => {
    emailCount.mockResolvedValue(30_229);
    const page = await listSuppressedEmailsForStaff({
      accessibleClientIds: ACCESSIBLE,
      offset: 400,
    });

    expect(emailFindMany.mock.calls[0][0].skip).toBe(400);
    expect(emailFindMany.mock.calls[0][0].take).toBe(SUPPRESSION_ROW_PAGE_SIZE);
    expect(page.offset).toBe(400);
  });
});

describe("search reaches the database, not just the loaded rows", () => {
  it("pushes the search term into the where clause", async () => {
    await listSuppressedEmailsForStaff({
      accessibleClientIds: ACCESSIBLE,
      search: "joe@opensdoors.co.uk",
    });

    const where = emailFindMany.mock.calls[0][0].where;
    expect(where.email).toEqual({
      contains: "joe@opensdoors.co.uk",
      mode: "insensitive",
    });
  });

  it("searches domains on the domain column", async () => {
    await listSuppressedDomainsForStaff({
      accessibleClientIds: ACCESSIBLE,
      search: "bteurope.com",
    });

    const where = domainFindMany.mock.calls[0][0].where;
    expect(where.domain).toEqual({
      contains: "bteurope.com",
      mode: "insensitive",
    });
  });

  it("does not treat a whitespace-only search as a filter", async () => {
    await listSuppressedEmailsForStaff({
      accessibleClientIds: ACCESSIBLE,
      search: "   ",
    });
    expect(emailFindMany.mock.calls[0][0].where.email).toBeUndefined();
  });

  it("KEEPS THE TENANT WALL when a search term is present", async () => {
    await listSuppressedEmailsForStaff({
      accessibleClientIds: ACCESSIBLE,
      search: "anything",
    });

    const where = emailFindMany.mock.calls[0][0].where;
    // Searching must narrow the set, never widen it past the accessible clients.
    expect(where.clientId).toEqual({ in: ACCESSIBLE });
  });

  it("keeps the single-client filter when a search term is present", async () => {
    await listSuppressedEmailsForStaff({
      accessibleClientIds: ACCESSIBLE,
      filterClientId: "client-b",
      search: "anything",
    });

    const where = emailFindMany.mock.calls[0][0].where;
    expect(where.clientId).toBe("client-b");
  });

  it("refuses a client filter outside the accessible list", async () => {
    await expect(
      listSuppressedEmailsForStaff({
        accessibleClientIds: ACCESSIBLE,
        filterClientId: "someone-elses-client",
      }),
    ).rejects.toThrow();
    expect(emailFindMany).not.toHaveBeenCalled();
  });

  it("asks the database for nothing when no client is accessible", async () => {
    const page = await listSuppressedEmailsForStaff({
      accessibleClientIds: [],
    });
    expect(page).toEqual({
      rows: [],
      total: 0,
      pageSize: SUPPRESSION_ROW_PAGE_SIZE,
      offset: 0,
    });
    expect(emailFindMany).not.toHaveBeenCalled();
    expect(emailCount).not.toHaveBeenCalled();
  });
});

describe("the sentence under the table tells the truth", () => {
  const emails = { one: "blocked email address", many: "blocked email addresses" };

  it("never says 'N of N' when there are more rows than are shown", () => {
    const text = describeRowWindow({
      total: 30_229,
      shown: 200,
      offset: 0,
      searching: false,
      noun: emails,
    });
    expect(text).toContain("30,229");
    expect(text).not.toBe("Showing 200 of 200");
    expect(text).toMatch(/1.*200/);
  });

  it("says so plainly when everything really is on screen", () => {
    const text = describeRowWindow({
      total: 47,
      shown: 47,
      offset: 0,
      searching: false,
      noun: emails,
    });
    expect(text).toBe("Showing all 47 blocked email addresses.");
  });

  it("counts matches, not rows, when a search is running", () => {
    const text = describeRowWindow({
      total: 1,
      shown: 1,
      offset: 0,
      searching: true,
      noun: emails,
    });
    expect(text).toBe("1 blocked email address matches your search.");
  });

  it("reports a search that found nothing without implying the list is empty", () => {
    const text = describeRowWindow({
      total: 0,
      shown: 0,
      offset: 0,
      searching: true,
      noun: emails,
    });
    expect(text).toBe("No blocked email addresses match your search.");
  });

  it("describes a later page by its real position", () => {
    const text = describeRowWindow({
      total: 30_229,
      shown: 200,
      offset: 400,
      searching: false,
      noun: emails,
    });
    expect(text).toBe("Showing 401–600 of 30,229 blocked email addresses.");
  });
});
