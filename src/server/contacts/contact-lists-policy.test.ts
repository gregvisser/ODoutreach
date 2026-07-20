import { describe, expect, it } from "vitest";

import {
  assertContactListClientScope,
  normalizeContactListName,
  resolveImportListTarget,
} from "./contact-lists-policy";

describe("normalizeContactListName", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeContactListName("  Prospects  ")).toBe("Prospects");
  });

  it("collapses interior whitespace runs to a single space", () => {
    expect(normalizeContactListName("  Foo   Bar ")).toBe("Foo Bar");
  });

  it("collapses tabs and newlines too", () => {
    expect(normalizeContactListName("Foo\t\tBar\nBaz")).toBe("Foo Bar Baz");
  });

  it("returns an empty string for whitespace-only input", () => {
    expect(normalizeContactListName("   \t \n ")).toBe("");
  });

  it("leaves an already-clean name untouched", () => {
    expect(normalizeContactListName("Q3 Outreach")).toBe("Q3 Outreach");
  });
});

describe("resolveImportListTarget", () => {
  it("selects an existing list when an id is supplied", () => {
    expect(resolveImportListTarget({ existingListId: "list-1" })).toEqual({
      kind: "existing",
      listId: "list-1",
    });
  });

  it("prefers the existing list when both an id and a new name are supplied", () => {
    expect(
      resolveImportListTarget({ existingListId: "list-1", newListName: "New List" }),
    ).toEqual({ kind: "existing", listId: "list-1" });
  });

  it("trims the supplied list id", () => {
    expect(resolveImportListTarget({ existingListId: "  list-1  " })).toEqual({
      kind: "existing",
      listId: "list-1",
    });
  });

  it("creates a new list from a name when no id is supplied", () => {
    expect(resolveImportListTarget({ newListName: "  Q3   Outreach " })).toEqual({
      kind: "new",
      listName: "Q3 Outreach",
    });
  });

  it("falls through to the new name when the existing id is only whitespace", () => {
    expect(
      resolveImportListTarget({ existingListId: "   ", newListName: "Fallback" }),
    ).toEqual({ kind: "new", listName: "Fallback" });
  });

  it("blocks an import that targets no list at all", () => {
    // Loose imports are deliberately refused — contacts must land in a known list.
    expect(resolveImportListTarget({})).toEqual({
      error: "Choose an existing list or enter a new list name before importing.",
    });
  });

  it.each([
    [{ existingListId: null, newListName: null }],
    [{ existingListId: "", newListName: "" }],
    [{ newListName: "    " }],
  ])("blocks empty selection %j", (input) => {
    expect(resolveImportListTarget(input)).toEqual({
      error: "Choose an existing list or enter a new list name before importing.",
    });
  });

  it("accepts a name of exactly 120 characters", () => {
    const name = "a".repeat(120);
    expect(resolveImportListTarget({ newListName: name })).toEqual({
      kind: "new",
      listName: name,
    });
  });

  it("rejects a name longer than 120 characters", () => {
    expect(resolveImportListTarget({ newListName: "a".repeat(121) })).toEqual({
      error: "List name must be 120 characters or fewer.",
    });
  });

  it("measures length after normalization, not before", () => {
    // 120 characters plus collapsible whitespace is still acceptable.
    const name = `${"a".repeat(60)}    ${"b".repeat(59)}`;
    const result = resolveImportListTarget({ newListName: `   ${name}   ` });
    expect(result).toEqual({ kind: "new", listName: `${"a".repeat(60)} ${"b".repeat(59)}` });
  });
});

describe("assertContactListClientScope — tenant isolation", () => {
  const client = "client-1";
  const other = "client-2";

  it("accepts contacts and a list that all belong to the required workspace", () => {
    expect(() =>
      assertContactListClientScope({
        list: { id: "l1", clientId: client },
        contacts: [
          { id: "c1", clientId: client },
          { id: "c2", clientId: client },
        ],
        requiredClientId: client,
      }),
    ).not.toThrow();
  });

  it("accepts a global list with a null clientId", () => {
    expect(() =>
      assertContactListClientScope({
        list: { id: "l1", clientId: null },
        contacts: [{ id: "c1", clientId: client }],
        requiredClientId: client,
      }),
    ).not.toThrow();
  });

  it("accepts an empty contact set", () => {
    expect(() =>
      assertContactListClientScope({
        list: { id: "l1", clientId: client },
        contacts: [],
        requiredClientId: client,
      }),
    ).not.toThrow();
  });

  it("rejects a missing required client id", () => {
    expect(() =>
      assertContactListClientScope({
        list: { id: "l1", clientId: client },
        contacts: [],
        requiredClientId: "",
      }),
    ).toThrow("SCOPE_REQUIRED_CLIENT_ID_MISSING");
  });

  it("rejects a list owned by another workspace", () => {
    expect(() =>
      assertContactListClientScope({
        list: { id: "l1", clientId: other },
        contacts: [{ id: "c1", clientId: client }],
        requiredClientId: client,
      }),
    ).toThrow("SCOPE_LIST_CLIENT_MISMATCH");
  });

  it("rejects a contact belonging to another workspace", () => {
    expect(() =>
      assertContactListClientScope({
        list: { id: "l1", clientId: client },
        contacts: [{ id: "c1", clientId: other }],
        requiredClientId: client,
      }),
    ).toThrow("SCOPE_CONTACT_CLIENT_MISMATCH");
  });

  it("rejects a mixed batch where only one contact is foreign", () => {
    // The dangerous case: a single smuggled contact in an otherwise valid write.
    expect(() =>
      assertContactListClientScope({
        list: { id: "l1", clientId: client },
        contacts: [
          { id: "c1", clientId: client },
          { id: "c2", clientId: other },
          { id: "c3", clientId: client },
        ],
        requiredClientId: client,
      }),
    ).toThrow("SCOPE_CONTACT_CLIENT_MISMATCH");
  });

  it("checks the required id before the list, so a blank id never passes", () => {
    expect(() =>
      assertContactListClientScope({
        list: { id: "l1", clientId: null },
        contacts: [{ id: "c1", clientId: other }],
        requiredClientId: "",
      }),
    ).toThrow("SCOPE_REQUIRED_CLIENT_ID_MISSING");
  });
});
