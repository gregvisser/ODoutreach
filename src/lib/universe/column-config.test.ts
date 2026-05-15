import { describe, expect, it } from "vitest";

import { STAFF_VISIBLE_CONTACT_IMPORT_HEADERS } from "@/lib/contact-import-contract";
import {
  UNIVERSE_CONTACT_FIELD_COLUMNS,
  UNIVERSE_CONTACT_FIELD_KEYS,
  parseUniverseVisibleColumns,
  serializeUniverseVisibleColumns,
} from "@/lib/universe/column-config";

describe("Universe column config (PR #138)", () => {
  it("exposes exactly the twelve canonical contact-field columns", () => {
    expect(UNIVERSE_CONTACT_FIELD_COLUMNS).toHaveLength(12);
    expect(UNIVERSE_CONTACT_FIELD_KEYS).toHaveLength(12);
  });

  it("uses the staff-visible header spellings for each column label", () => {
    expect(UNIVERSE_CONTACT_FIELD_COLUMNS.map((c) => c.label)).toEqual([
      ...STAFF_VISIBLE_CONTACT_IMPORT_HEADERS,
    ]);
  });

  it("parses an undefined param as all twelve columns visible (legacy default)", () => {
    const set = parseUniverseVisibleColumns(undefined);
    expect(set.size).toBe(12);
    for (const k of UNIVERSE_CONTACT_FIELD_KEYS) {
      expect(set.has(k)).toBe(true);
    }
  });

  it("parses a null param the same as undefined (server pass-through)", () => {
    const set = parseUniverseVisibleColumns(null);
    expect(set.size).toBe(12);
  });

  it("parses an empty string as no contact columns visible (explicit hide-all)", () => {
    const set = parseUniverseVisibleColumns("");
    expect(set.size).toBe(0);
  });

  it("ignores unknown codes and dedupes the rest", () => {
    const set = parseUniverseVisibleColumns("name,employer,bogus,name");
    expect([...set].sort()).toEqual(["employer", "name"]);
  });

  it("round-trips through serialize/parse", () => {
    const expected = new Set(["name", "country", "emails"] as const);
    const serialized = serializeUniverseVisibleColumns(expected);
    // serializer preserves canonical order, not insertion order.
    expect(serialized).toBe("name,country,emails");
    const parsed = parseUniverseVisibleColumns(serialized);
    expect([...parsed].sort()).toEqual([...expected].sort());
  });
});
