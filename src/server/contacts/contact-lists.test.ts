import { describe, expect, it } from "vitest";

import {
  assertContactListClientScope,
  normalizeContactListName,
  resolveImportListTarget,
} from "./contact-lists-policy";

describe("normalizeContactListName", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeContactListName("  Foo   Bar \n Baz ")).toBe("Foo Bar Baz");
  });

  it("returns empty string for whitespace-only input", () => {
    expect(normalizeContactListName("   \n\t ")).toBe("");
  });
});

describe("resolveImportListTarget", () => {
  it("prefers existing list id when both provided", () => {
    const t = resolveImportListTarget({
      existingListId: "clx-existing",
      newListName: "new name",
    });
    expect(t).toEqual({ kind: "existing", listId: "clx-existing" });
  });

  it("returns new list when only newListName given", () => {
    const t = resolveImportListTarget({
      existingListId: "",
      newListName: "  Manchester FDs ",
    });
    expect(t).toEqual({ kind: "new", listName: "Manchester FDs" });
  });

  it("returns error when neither provided", () => {
    const t = resolveImportListTarget({});
    expect(t).toEqual({
      error: expect.stringMatching(/existing list or enter a new list name/i),
    });
  });

  it("returns error when only blank newListName given", () => {
    const t = resolveImportListTarget({
      existingListId: "   ",
      newListName: "   ",
    });
    expect("error" in t && t.error).toMatch(
      /existing list or enter a new list name/i,
    );
  });

  it("rejects names over 120 characters", () => {
    const longName = "a".repeat(121);
    const t = resolveImportListTarget({ newListName: longName });
    expect("error" in t && t.error).toMatch(/120 characters or fewer/);
  });

  it("accepts names at the 120 character boundary", () => {
    const okName = "a".repeat(120);
    expect(resolveImportListTarget({ newListName: okName })).toEqual({
      kind: "new",
      listName: okName,
    });
  });
});

describe("assertContactListClientScope", () => {
  it("passes when list + all contacts share the required client", () => {
    expect(() =>
      assertContactListClientScope({
        list: { id: "list-a", clientId: "client-a" },
        contacts: [
          { id: "c1", clientId: "client-a" },
          { id: "c2", clientId: "client-a" },
        ],
        requiredClientId: "client-a",
      }),
    ).not.toThrow();
  });

  it("passes for a global list when contacts share the required client", () => {
    expect(() =>
      assertContactListClientScope({
        list: { id: "list-g", clientId: null },
        contacts: [{ id: "c1", clientId: "client-a" }],
        requiredClientId: "client-a",
      }),
    ).not.toThrow();
  });

  it("rejects when a contact belongs to a different client", () => {
    expect(() =>
      assertContactListClientScope({
        list: { id: "list-a", clientId: "client-a" },
        contacts: [
          { id: "c1", clientId: "client-a" },
          { id: "c2", clientId: "client-b" },
        ],
        requiredClientId: "client-a",
      }),
    ).toThrow(/SCOPE_CONTACT_CLIENT_MISMATCH/);
  });

  it("rejects when the list is client-scoped to a different client", () => {
    expect(() =>
      assertContactListClientScope({
        list: { id: "list-a", clientId: "client-a" },
        contacts: [{ id: "c1", clientId: "client-b" }],
        requiredClientId: "client-b",
      }),
    ).toThrow(/SCOPE_LIST_CLIENT_MISMATCH/);
  });

  it("rejects when requiredClientId is empty", () => {
    expect(() =>
      assertContactListClientScope({
        list: { id: "list-a", clientId: null },
        contacts: [{ id: "c1", clientId: "client-a" }],
        requiredClientId: "",
      }),
    ).toThrow(/SCOPE_REQUIRED_CLIENT_ID_MISSING/);
  });

  it("accepts an empty contacts set", () => {
    expect(() =>
      assertContactListClientScope({
        list: { id: "list-a", clientId: "client-a" },
        contacts: [],
        requiredClientId: "client-a",
      }),
    ).not.toThrow();
  });
});
