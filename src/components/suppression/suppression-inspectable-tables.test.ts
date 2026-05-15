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

describe("Email / domain row filter helpers (PR #140)", () => {
  const rows = [
    { id: "r1", value: "alpha@example.test", clientName: "Alpha Client" },
    { id: "r2", value: "bravo@example.test", clientName: "Bravo Client" },
    { id: "r3", value: "charlie@other.test", clientName: "Alpha Client" },
  ];

  it("matches against both value and client", () => {
    expect(
      rowsTest.applyFilters(rows, "alpha", "value", "asc").map((r) => r.id),
    ).toEqual(["r1", "r3"]);
    expect(
      rowsTest.applyFilters(rows, "bravo", "value", "asc").map((r) => r.id),
    ).toEqual(["r2"]);
  });

  it("sorts ascending and descending by value and client", () => {
    expect(
      rowsTest.applyFilters(rows, "", "value", "asc").map((r) => r.id),
    ).toEqual(["r1", "r2", "r3"]);
    expect(
      rowsTest.applyFilters(rows, "", "value", "desc").map((r) => r.id),
    ).toEqual(["r3", "r2", "r1"]);
    expect(
      rowsTest.applyFilters(rows, "", "client", "asc").map((r) => r.id),
    ).toEqual(["r1", "r3", "r2"]);
  });
});
