import { describe, expect, it } from "vitest";

import {
  buildClientListsOverview,
  type RawListForView,
  type RawListMemberForView,
} from "./contact-lists-view-model";

function baseList(overrides: Partial<RawListForView> = {}): RawListForView {
  return {
    id: "list-1",
    name: "List One",
    description: null,
    clientId: "client-a",
    createdAt: new Date("2026-04-01T00:00:00Z"),
    updatedAt: new Date("2026-04-10T00:00:00Z"),
    createdByName: null,
    ...overrides,
  };
}

function baseMember(
  overrides: Partial<RawListMemberForView> &
    Partial<RawListMemberForView["contact"]> = {},
): RawListMemberForView {
  const {
    id,
    contactListId,
    addedAt,
    contact: contactOverride,
    ...contactPrimitive
  } = overrides as RawListMemberForView & Partial<RawListMemberForView["contact"]>;
  return {
    id: id ?? "member-1",
    contactListId: contactListId ?? "list-1",
    addedAt: addedAt ?? new Date("2026-04-05T00:00:00Z"),
    contact: {
      id: "contact-1",
      email: "alice@example.com",
      fullName: "Alice Example",
      firstName: null,
      lastName: null,
      company: "ACME Ltd",
      linkedIn: null,
      mobilePhone: null,
      officePhone: null,
      isSuppressed: false,
      ...(contactPrimitive as Partial<RawListMemberForView["contact"]>),
      ...(contactOverride ?? {}),
    },
  };
}

describe("buildClientListsOverview", () => {
  it("returns an empty overview when there are no lists", () => {
    const overview = buildClientListsOverview({ lists: [], members: [] });
    expect(overview.lists).toEqual([]);
    expect(overview.totals).toEqual({
      totalLists: 0,
      uniqueContacts: {
        total: 0,
        valid: 0,
        emailSendable: 0,
        suppressed: 0,
        missingEmail: 0,
        missingOutreachIdentifier: 0,
      },
    });
  });

  it("returns an empty list card when the list has no members", () => {
    const overview = buildClientListsOverview({
      lists: [baseList()],
      members: [],
    });
    expect(overview.lists).toHaveLength(1);
    const list = overview.lists[0]!;
    expect(list.memberCount).toBe(0);
    expect(list.readiness.total).toBe(0);
    expect(list.statusLabel).toBe("needs_contacts");
    expect(list.hasSuppression).toBe(false);
    expect(list.recentMembers).toEqual([]);
    expect(overview.totals.totalLists).toBe(1);
    expect(overview.totals.uniqueContacts.total).toBe(0);
  });

  it("marks a list as ready_for_sequence when at least one email-sendable contact is present", () => {
    const overview = buildClientListsOverview({
      lists: [baseList()],
      members: [
        baseMember({
          id: "m1",
          contactListId: "list-1",
          email: "sendable@example.com",
          isSuppressed: false,
        }),
      ],
    });
    const list = overview.lists[0]!;
    expect(list.memberCount).toBe(1);
    expect(list.readiness.emailSendable).toBe(1);
    expect(list.readiness.valid).toBe(1);
    expect(list.statusLabel).toBe("ready_for_sequence");
    expect(list.hasSuppression).toBe(false);
    expect(list.recentMembers[0]?.status).toBe("email_sendable");
  });

  it("treats a suppressed contact as suppressed (not valid, not email-sendable)", () => {
    const overview = buildClientListsOverview({
      lists: [baseList()],
      members: [
        baseMember({
          id: "m-sup",
          contactListId: "list-1",
          email: "blocked@example.com",
          isSuppressed: true,
        }),
      ],
    });
    const list = overview.lists[0]!;
    expect(list.readiness.suppressed).toBe(1);
    expect(list.readiness.emailSendable).toBe(0);
    expect(list.readiness.valid).toBe(0);
    expect(list.statusLabel).toBe("needs_email_sendable");
    expect(list.hasSuppression).toBe(true);
    expect(list.recentMembers[0]?.status).toBe("suppressed");
  });

  it("counts a LinkedIn/phone-only contact as valid but not email-sendable", () => {
    // Per readiness rules: valid requires not suppressed + any outreach
    // identifier; email-sendable additionally requires a non-empty email.
    const overview = buildClientListsOverview({
      lists: [baseList()],
      members: [
        baseMember({
          id: "m-li",
          contactListId: "list-1",
          email: "", // schema stores email but this contact has no usable address
          linkedIn: "https://linkedin.com/in/jane",
          isSuppressed: false,
        }),
      ],
    });
    const list = overview.lists[0]!;
    expect(list.readiness.valid).toBe(1);
    expect(list.readiness.emailSendable).toBe(0);
    expect(list.readiness.missingEmail).toBe(1);
    expect(list.readiness.missingOutreachIdentifier).toBe(0);
    expect(list.statusLabel).toBe("needs_email_sendable");
    expect(list.recentMembers[0]?.status).toBe("valid_no_email");
  });

  it("flags a contact with no identifier at all as missing_identifier", () => {
    const overview = buildClientListsOverview({
      lists: [baseList()],
      members: [
        baseMember({
          id: "m-mi",
          contactListId: "list-1",
          email: "",
          linkedIn: null,
          mobilePhone: null,
          officePhone: null,
          isSuppressed: false,
        }),
      ],
    });
    const list = overview.lists[0]!;
    expect(list.readiness.missingOutreachIdentifier).toBe(1);
    expect(list.readiness.valid).toBe(0);
    expect(list.readiness.emailSendable).toBe(0);
    expect(list.statusLabel).toBe("needs_email_sendable");
    expect(list.recentMembers[0]?.status).toBe("missing_identifier");
  });

  it("returns recentMembers sorted by addedAt desc and capped to previewSize", () => {
    const makeMember = (i: number) =>
      baseMember({
        id: `m-${i}`,
        contactListId: "list-1",
        addedAt: new Date(
          Date.UTC(2026, 3, 1 + i, 0, 0, 0),
        ) /* April 2026, d = i+1 */,
        contact: {
          id: `contact-${i}`,
          email: `c${i}@example.com`,
          fullName: `Contact ${i}`,
          firstName: null,
          lastName: null,
          company: null,
          linkedIn: null,
          mobilePhone: null,
          officePhone: null,
          isSuppressed: false,
        },
      });

    const overview = buildClientListsOverview({
      lists: [baseList()],
      members: [1, 2, 3, 4, 5, 6, 7].map(makeMember),
      previewSize: 5,
    });
    const preview = overview.lists[0]!.recentMembers;
    expect(preview).toHaveLength(5);
    expect(preview.map((p) => p.id)).toEqual([
      "contact-7",
      "contact-6",
      "contact-5",
      "contact-4",
      "contact-3",
    ]);
  });

  it("dedupes the page-wide unique-contacts totals when a contact is in multiple lists", () => {
    const listA = baseList({ id: "list-a", name: "A" });
    const listB = baseList({
      id: "list-b",
      name: "B",
      updatedAt: new Date("2026-04-11T00:00:00Z"),
    });
    const sharedContact = {
      id: "contact-shared",
      email: "shared@example.com",
      fullName: "Shared Contact",
      firstName: null,
      lastName: null,
      company: null,
      linkedIn: null,
      mobilePhone: null,
      officePhone: null,
      isSuppressed: false,
    };
    const overview = buildClientListsOverview({
      lists: [listA, listB],
      members: [
        baseMember({
          id: "m-a",
          contactListId: "list-a",
          contact: sharedContact,
        }),
        baseMember({
          id: "m-b",
          contactListId: "list-b",
          contact: sharedContact,
        }),
        baseMember({
          id: "m-b2",
          contactListId: "list-b",
          contact: {
            ...sharedContact,
            id: "contact-only-b",
            email: "only-b@example.com",
          },
        }),
      ],
    });

    expect(overview.totals.totalLists).toBe(2);
    // Two distinct contacts across both lists, both email-sendable.
    expect(overview.totals.uniqueContacts.total).toBe(2);
    expect(overview.totals.uniqueContacts.emailSendable).toBe(2);

    const byId = new Map(overview.lists.map((l) => [l.id, l]));
    expect(byId.get("list-a")?.memberCount).toBe(1);
    expect(byId.get("list-b")?.memberCount).toBe(2);
  });

  it("falls back to firstName + lastName, then email, for displayName", () => {
    const overview = buildClientListsOverview({
      lists: [baseList()],
      members: [
        baseMember({
          id: "m-fn",
          contactListId: "list-1",
          contact: {
            id: "c-fn",
            email: "bob@example.com",
            fullName: null,
            firstName: "Bob",
            lastName: "Marks",
            company: null,
            linkedIn: null,
            mobilePhone: null,
            officePhone: null,
            isSuppressed: false,
          },
        }),
        baseMember({
          id: "m-email-only",
          contactListId: "list-1",
          contact: {
            id: "c-email-only",
            email: "only@example.com",
            fullName: null,
            firstName: null,
            lastName: null,
            company: null,
            linkedIn: null,
            mobilePhone: null,
            officePhone: null,
            isSuppressed: false,
          },
        }),
      ],
    });
    const preview = overview.lists[0]!.recentMembers;
    const byId = new Map(preview.map((p) => [p.id, p]));
    expect(byId.get("c-fn")?.displayName).toBe("Bob Marks");
    expect(byId.get("c-email-only")?.displayName).toBe("only@example.com");
  });

  it("reports hasSuppression alongside ready_for_sequence when a list has both kinds", () => {
    const overview = buildClientListsOverview({
      lists: [baseList()],
      members: [
        baseMember({
          id: "m-ok",
          contactListId: "list-1",
          contact: {
            id: "c-ok",
            email: "ok@example.com",
            fullName: "Ok One",
            firstName: null,
            lastName: null,
            company: null,
            linkedIn: null,
            mobilePhone: null,
            officePhone: null,
            isSuppressed: false,
          },
        }),
        baseMember({
          id: "m-sup",
          contactListId: "list-1",
          contact: {
            id: "c-sup",
            email: "sup@example.com",
            fullName: "Suppressed",
            firstName: null,
            lastName: null,
            company: null,
            linkedIn: null,
            mobilePhone: null,
            officePhone: null,
            isSuppressed: true,
          },
        }),
      ],
    });
    const list = overview.lists[0]!;
    expect(list.statusLabel).toBe("ready_for_sequence");
    expect(list.hasSuppression).toBe(true);
    expect(list.readiness.emailSendable).toBe(1);
    expect(list.readiness.suppressed).toBe(1);
  });
});
