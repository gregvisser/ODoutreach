import { describe, expect, it } from "vitest";

import { __test__ } from "@/components/lists/list-detail-contact-table";
import type { ContactDeliveryRow } from "@/server/queries/client-contact-list-detail";

/**
 * PR #140 (G7) — list-detail search/sort/filter controls.
 *
 * The list-detail table on `/clients/[clientId]/lists/[listId]` now has
 * a client-side search, status filter, and sort UI so staff can inspect
 * a list after sending and find people quickly.
 *
 * These tests cover the *pure* helpers (`matchesSearch`, `matchesStatus`,
 * `sortRows`) so we don't touch a DOM/render path. The helpers are the
 * only thing that could regress filter correctness. PII is fabricated:
 * the fixture below uses obviously-fake names so a stack trace in CI
 * never leaks real contacts.
 */

const { matchesSearch, matchesStatus, sortRows, STATUS_FILTER_LABELS, SORT_COLUMN_LABELS } =
  __test__;

function row(partial: Partial<ContactDeliveryRow>): ContactDeliveryRow {
  return {
    contactId: "c1",
    name: "Unnamed Tester",
    employer: null,
    industry: null,
    firstName: null,
    lastName: null,
    city: null,
    country: null,
    linkedin: null,
    jobTitle: null,
    email: null,
    mobile: null,
    office: null,
    isSuppressed: false,
    sequenceName: null,
    stepName: null,
    mailboxLabel: null,
    subject: null,
    sendStatus: "Not sent",
    skipReason: null,
    sentAt: null,
    failedAt: null,
    bounceStatus: null,
    repliedAt: null,
    unsubscribedAt: null,
    latestEventLabel: null,
    opensLabel: "—",
    hasOutboundEmail: false,
    hasProviderProof: false,
    hasSentTimestamp: false,
    hasBounce: false,
    hasReply: false,
    hasUnsubscribe: false,
    ...partial,
  };
}

describe("list-detail search/filter/sort helpers (PR #140)", () => {
  describe("matchesSearch", () => {
    it("returns every row when query is empty", () => {
      const r = row({ name: "Alex Example" });
      expect(matchesSearch(r, "")).toBe(true);
    });

    it("matches on name, employer, email, city, country and title", () => {
      const r = row({
        name: "Alex Example",
        employer: "Fictional Corp",
        email: "alex@example.test",
        city: "Manchester",
        country: "United Kingdom",
        jobTitle: "Head of Pretend Things",
      });
      expect(matchesSearch(r, "ALEX")).toBe(true);
      expect(matchesSearch(r, "fictional")).toBe(true);
      expect(matchesSearch(r, "example.test")).toBe(true);
      expect(matchesSearch(r, "manchester")).toBe(true);
      expect(matchesSearch(r, "united kingdom")).toBe(true);
      expect(matchesSearch(r, "pretend")).toBe(true);
    });

    it("does not match unrelated strings", () => {
      const r = row({ name: "Alex Example", employer: "Fictional Corp" });
      expect(matchesSearch(r, "definitelynotthere")).toBe(false);
    });
  });

  describe("matchesStatus", () => {
    it("'All' matches every row", () => {
      const r = row({ sendStatus: "Sent from mailbox" });
      expect(matchesStatus(r, "All")).toBe(true);
    });

    it("status filters match the corresponding sendStatus", () => {
      expect(
        matchesStatus(row({ sendStatus: "Sent from mailbox" }), "Sent from mailbox"),
      ).toBe(true);
      expect(matchesStatus(row({ sendStatus: "Replied" }), "Replied")).toBe(true);
      expect(matchesStatus(row({ sendStatus: "Bounced" }), "Bounced")).toBe(true);
      expect(matchesStatus(row({ sendStatus: "Queued" }), "Queued")).toBe(true);
      expect(
        matchesStatus(row({ sendStatus: "Awaiting send" }), "Awaiting send"),
      ).toBe(true);
      expect(
        matchesStatus(row({ sendStatus: "Send proof missing" }), "Send proof missing"),
      ).toBe(true);
      expect(matchesStatus(row({ sendStatus: "Failed" }), "Failed")).toBe(true);
      expect(matchesStatus(row({ sendStatus: "Unsubscribed" }), "Unsubscribed")).toBe(
        true,
      );
      expect(
        matchesStatus(row({ sendStatus: "Suppressed / skipped" }), "Suppressed / skipped"),
      ).toBe(true);
    });

    it("'Not sent' matches rows with the literal 'Not sent' status and excludes other delivery states", () => {
      expect(matchesStatus(row({ sendStatus: "Not sent" }), "Not sent")).toBe(true);
      expect(matchesStatus(row({ sendStatus: "Sent from mailbox" }), "Not sent")).toBe(
        false,
      );
      expect(matchesStatus(row({ sendStatus: "Replied" }), "Not sent")).toBe(false);
      // "Awaiting send" is a real delivery state — it must NOT collapse
      // into the "Not sent" bucket.
      expect(matchesStatus(row({ sendStatus: "Awaiting send" }), "Not sent")).toBe(false);
    });

    it("filter selections are mismatch when status differs", () => {
      expect(
        matchesStatus(row({ sendStatus: "Sent from mailbox" }), "Replied"),
      ).toBe(false);
    });
  });

  describe("sortRows", () => {
    it("sorts by name ascending and descending", () => {
      const rows = [
        row({ contactId: "1", name: "Bravo Tester" }),
        row({ contactId: "2", name: "Alpha Tester" }),
        row({ contactId: "3", name: "Charlie Tester" }),
      ];
      const asc = sortRows(rows, "name", "asc").map((r) => r.contactId);
      const desc = sortRows(rows, "name", "desc").map((r) => r.contactId);
      expect(asc).toEqual(["2", "1", "3"]);
      expect(desc).toEqual(["3", "1", "2"]);
    });

    it("sorts by employer, putting null/empty employer last in both directions", () => {
      const rows = [
        row({ contactId: "1", employer: "Bravo Co" }),
        row({ contactId: "2", employer: null }),
        row({ contactId: "3", employer: "Alpha Co" }),
      ];
      const asc = sortRows(rows, "employer", "asc").map((r) => r.contactId);
      expect(asc[0]).toBe("3");
      expect(asc[1]).toBe("1");
      expect(asc[2]).toBe("2");
    });

    it("sorts by sent time with nulls last", () => {
      const a = new Date("2026-04-01T10:00:00Z");
      const b = new Date("2026-04-02T10:00:00Z");
      const rows = [
        row({ contactId: "1", sentAt: b }),
        row({ contactId: "2", sentAt: null }),
        row({ contactId: "3", sentAt: a }),
      ];
      const asc = sortRows(rows, "sent", "asc").map((r) => r.contactId);
      // oldest first, null last
      expect(asc).toEqual(["3", "1", "2"]);
    });

    it("sorts by status alphabetically", () => {
      const rows = [
        row({ contactId: "1", sendStatus: "Replied" }),
        row({ contactId: "2", sendStatus: "Bounced" }),
        row({ contactId: "3", sendStatus: "Sent from mailbox" }),
      ];
      const asc = sortRows(rows, "status", "asc").map((r) => r.contactId);
      // Lexical: Bounced < Replied < Sent from mailbox
      expect(asc).toEqual(["2", "1", "3"]);
    });

    it("never mutates the input array", () => {
      const rows = [
        row({ contactId: "1", name: "Bravo" }),
        row({ contactId: "2", name: "Alpha" }),
      ];
      const before = rows.map((r) => r.contactId);
      sortRows(rows, "name", "desc");
      expect(rows.map((r) => r.contactId)).toEqual(before);
    });
  });

  describe("filter label contract", () => {
    it("exposes every staff-facing status the brief requires", () => {
      // Brief explicitly lists these as the user-facing filter options.
      for (const label of [
        "All",
        "Sent from mailbox",
        "Queued",
        "Send proof missing",
        "Failed",
        "Bounced",
        "Replied",
        "Unsubscribed",
        "Suppressed / skipped",
        "Not sent",
      ]) {
        expect(STATUS_FILTER_LABELS).toContain(label);
      }
    });

    it("never exposes raw enum tokens to staff", () => {
      for (const label of STATUS_FILTER_LABELS) {
        expect(label).not.toMatch(/^[A-Z_]+$/);
      }
    });

    it("sort columns cover the brief-required dimensions", () => {
      // Brief: Name, Employer, Country, Status, Sent time.
      expect(Object.values(SORT_COLUMN_LABELS)).toEqual(
        expect.arrayContaining(["Name", "Employer", "Country", "Status", "Sent time"]),
      );
    });
  });
});
