import { describe, expect, it } from "vitest";

import { __test__ as sourcesTest } from "@/components/suppression/suppression-sources-inspectable-table";
import { __test__ as rowsTest } from "@/components/suppression/suppression-rows-inspectable-table";

/**
 * PR #140 (G7) — Do-not-contact table inspection controls.
 *
 * Locks in:
 *   * Filter helpers exist and apply search + kind + sort correctly.
 *   * Raw enum tokens (EMAIL / DOMAIN / OK / FAILED / PENDING) are not
 *     surfaced as labels — staff-friendly labels are used instead.
 *   * Sync server actions are NOT invoked by render — only the
 *     filter UI is wired. (Render-time invocation is not possible
 *     because the action is passed only to a `<form action>` and is
 *     never called from filter handlers.)
 *
 * No DOM is touched: these are pure helper tests. No production data
 * is read; no PII is fabricated; no Google Sheets / sync code path is
 * exercised.
 */

describe("Connected sheets filter helpers (PR #140)", () => {
  const fixtureSources = [
    {
      id: "src-1",
      kind: "EMAIL" as const,
      spreadsheetId: "abc",
      sheetRange: "Sheet1!A:B",
      syncStatus: "OK",
      lastError: null,
      client: { id: "c1", name: "Alpha Client" },
      _count: { suppressedEmails: 12, suppressedDomains: 0 },
    },
    {
      id: "src-2",
      kind: "DOMAIN" as const,
      spreadsheetId: "xyz",
      sheetRange: "Domains!A:A",
      syncStatus: "FAILED",
      lastError: "Permission denied",
      client: { id: "c2", name: "Bravo Client" },
      _count: { suppressedEmails: 0, suppressedDomains: 4 },
    },
    {
      id: "src-3",
      kind: "EMAIL" as const,
      spreadsheetId: "qqq",
      sheetRange: null,
      syncStatus: "PENDING",
      lastError: null,
      client: { id: "c3", name: "Charlie Client" },
      _count: { suppressedEmails: 33, suppressedDomains: 0 },
    },
  ];

  it("applies the kind filter (EMAIL only / DOMAIN only / ALL)", () => {
    expect(
      sourcesTest
        .applyFilters(fixtureSources, "", "ALL", "client", "asc")
        .map((s) => s.id),
    ).toEqual(["src-1", "src-2", "src-3"]);
    expect(
      sourcesTest
        .applyFilters(fixtureSources, "", "EMAIL", "client", "asc")
        .map((s) => s.id),
    ).toEqual(["src-1", "src-3"]);
    expect(
      sourcesTest
        .applyFilters(fixtureSources, "", "DOMAIN", "client", "asc")
        .map((s) => s.id),
    ).toEqual(["src-2"]);
  });

  it("applies the search query against client and metadata", () => {
    expect(
      sourcesTest
        .applyFilters(fixtureSources, "Bravo", "ALL", "client", "asc")
        .map((s) => s.id),
    ).toEqual(["src-2"]);
    expect(
      sourcesTest
        .applyFilters(fixtureSources, "abc", "ALL", "client", "asc")
        .map((s) => s.id),
    ).toEqual(["src-1"]);
  });

  it("sorts by row count and by client", () => {
    const byRowsAsc = sourcesTest
      .applyFilters(fixtureSources, "", "ALL", "rows", "asc")
      .map((s) => s.id);
    // src-2 has 4 domains, src-1 has 12 emails, src-3 has 33 emails.
    expect(byRowsAsc).toEqual(["src-2", "src-1", "src-3"]);

    const byClientDesc = sourcesTest
      .applyFilters(fixtureSources, "", "ALL", "client", "desc")
      .map((s) => s.id);
    expect(byClientDesc).toEqual(["src-3", "src-2", "src-1"]);
  });

  it("kind filter dropdown exposes staff-friendly labels (no raw enums)", () => {
    for (const opt of sourcesTest.KIND_OPTIONS) {
      // Labels must not be a bare uppercase enum token.
      // ("EMAIL"/"DOMAIN" remain as VALUES for filter state; that's fine.)
      expect(opt.label).not.toMatch(/^[A-Z_]+$/);
    }
    expect(sourcesTest.KIND_OPTIONS.map((o) => o.label)).toEqual(
      expect.arrayContaining([
        "All list types",
        // staff-friendly labels from suppressionKindLabel:
        "Email addresses",
        "Whole domains",
      ]),
    );
  });

  it("sort options cover client, list type, row count, connection (brief)", () => {
    expect(sourcesTest.SORT_OPTIONS.map((o) => o.value)).toEqual(
      expect.arrayContaining(["client", "kind", "rows", "status"]),
    );
  });
});

/**
 * Queue item 27 (7) — the blocked-rows table no longer filters or sorts in the
 * browser, so the PR #140 `applyFilters` tests that used to live here have gone
 * with the helper they covered.
 *
 * They were not weakened, they were superseded: filtering 200 already-loaded
 * rows out of 30,229 answered "no matches" for addresses that WERE blocked, so
 * the search moved into the database. What replaces them is stronger — the
 * query-layer tests in `src/server/queries/suppression-rows.test.ts` and the
 * browser test in `e2e/suppression-search.spec.ts`, which searches for an
 * address that is provably not on the loaded page.
 *
 * What remains testable in this component is the paging/search URL it builds.
 * That is worth pinning: if it drops the carried params, paging one table
 * silently clears the other table's search, and a staff member is once again
 * looking at a filtered list they did not ask for.
 */
describe("Blocked-row table paging links (queue item 27)", () => {
  const { hrefWithOffset } = rowsTest;

  it("keeps the client filter and the other table's state when paging", () => {
    const href = hrefWithOffset(
      { client: "client-a", domainQ: "bt.com" },
      "email",
      "",
      200,
    );
    expect(href).toContain("client=client-a");
    // The domain table's search must survive paging the email table.
    expect(href).toContain("domainQ=bt.com");
    expect(href).toContain("emailFrom=200");
  });

  it("carries this table's own search across to the next page", () => {
    const href = hrefWithOffset({}, "email", "joe@opensdoors.co.uk", 400);
    expect(href).toContain("emailQ=joe%40opensdoors.co.uk");
    expect(href).toContain("emailFrom=400");
  });

  it("omits the offset entirely on the first page", () => {
    const href = hrefWithOffset({}, "domain", "bt", 0);
    expect(href).not.toContain("domainFrom");
    expect(href).toContain("domainQ=bt");
  });

  it("returns a bare path when there is nothing to carry", () => {
    expect(hrefWithOffset({}, "email", "", 0)).toBe("/suppression");
  });

  it("builds the Clear link so it drops the search but keeps the filter", () => {
    // This is exactly how the component renders "Clear": same params, no term.
    const href = hrefWithOffset({ client: "client-a" }, "email", "", 0);
    expect(href).toBe("/suppression?client=client-a");
    expect(href).not.toContain("emailQ");
  });
});
