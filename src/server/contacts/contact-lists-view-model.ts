/**
 * PR D3 — pure view-model builder for the client "Email lists" page.
 *
 * Given the raw `ContactList` rows + their `ContactListMember` joins (with
 * enough `Contact` fields to run readiness), return:
 *
 *   - per-list detail: name, description, timestamps, member count,
 *     per-list `ContactReadinessSummary`, a status label, and a compact
 *     member preview (latest N), and
 *   - page-wide totals computed against **unique contacts** (deduped by
 *     `contact.id`) to avoid double-counting a contact that appears in
 *     multiple lists.
 *
 * No DB access — the DB-facing wrapper lives in `contact-lists-view.ts`.
 * Keeping the reducer pure lets vitest cover the interesting branches
 * (empty list, email-sendable contact, suppressed contact, valid-no-email,
 * missing-identifier, cross-list dedupe, status-label selection) without
 * spinning up Prisma.
 */

import {
  classifyContactReadiness,
  readinessStatusLabel,
  summarizeContactReadiness,
  type ContactIdentifierFields,
  type ContactReadinessStatusLabel,
  type ContactReadinessSummary,
} from "@/lib/client-contacts-readiness";

/** Shape of a ContactListMember row passed into the builder. */
export type RawListMemberForView = {
  id: string;
  contactListId: string;
  addedAt: Date;
  contact: {
    id: string;
    email: string | null;
    fullName: string | null;
    firstName: string | null;
    lastName: string | null;
    company: string | null;
    linkedIn: string | null;
    mobilePhone: string | null;
    officePhone: string | null;
    isSuppressed: boolean;
  };
};

/** Shape of a ContactList row passed into the builder. */
export type RawListForView = {
  id: string;
  name: string;
  description: string | null;
  clientId: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdByName: string | null;
};

/**
 * Primary readiness pill for a list.
 *
 * Priority (first match wins):
 *   1. `needs_contacts` — list has no members yet.
 *   2. `needs_email_sendable` — members exist but none are email-sendable
 *      (because of missing emails, suppression, or missing identifiers).
 *   3. `ready_for_sequence` — at least one email-sendable member.
 *
 * "Has suppression" is surfaced as a secondary chip (`hasSuppression`)
 * rather than a primary status so that a list can be simultaneously
 * `ready_for_sequence` AND flag "N suppressed" for the operator.
 */
export type ListStatusLabel =
  | "needs_contacts"
  | "needs_email_sendable"
  | "ready_for_sequence";

export type MemberPreview = {
  /** Contact id (used as list-item key by consumers). */
  id: string;
  displayName: string;
  company: string | null;
  email: string | null;
  status: ContactReadinessStatusLabel;
};

export type ListDetail = {
  id: string;
  name: string;
  description: string | null;
  clientId: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdByName: string | null;
  memberCount: number;
  readiness: ContactReadinessSummary;
  statusLabel: ListStatusLabel;
  hasSuppression: boolean;
  recentMembers: MemberPreview[];
};

export type ClientListsOverview = {
  lists: ListDetail[];
  totals: {
    totalLists: number;
    /** Unique contacts across all lists for this client (deduped by contact id). */
    uniqueContacts: ContactReadinessSummary;
  };
};

/** Trim + return null when empty. */
function nonEmptyString(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildDisplayName(contact: RawListMemberForView["contact"]): string {
  const full = nonEmptyString(contact.fullName);
  if (full) return full;
  const parts = [
    nonEmptyString(contact.firstName),
    nonEmptyString(contact.lastName),
  ].filter((x): x is string => Boolean(x));
  if (parts.length > 0) return parts.join(" ");
  const email = nonEmptyString(contact.email);
  if (email) return email;
  return "—";
}

function toIdentifierFields(
  contact: RawListMemberForView["contact"],
): ContactIdentifierFields {
  return {
    email: contact.email,
    linkedIn: contact.linkedIn,
    mobilePhone: contact.mobilePhone,
    officePhone: contact.officePhone,
    isSuppressed: contact.isSuppressed,
  };
}

function chooseStatusLabel(args: {
  memberCount: number;
  emailSendable: number;
}): ListStatusLabel {
  if (args.memberCount === 0) return "needs_contacts";
  if (args.emailSendable === 0) return "needs_email_sendable";
  return "ready_for_sequence";
}

/**
 * Build the full client "Email lists" page view-model.
 *
 * - `lists` order is preserved from the caller (typically newest-updated first).
 * - `members` can be passed in any order; the builder groups by
 *   `contactListId` and sorts each list's preview by `addedAt` desc.
 * - Lists that do not appear in `members` are treated as empty (memberCount 0).
 */
export function buildClientListsOverview(args: {
  lists: RawListForView[];
  members: RawListMemberForView[];
  /** How many members to include in each list's preview. Defaults to 5. */
  previewSize?: number;
}): ClientListsOverview {
  const previewSize = args.previewSize ?? 5;

  const membersByList = new Map<string, RawListMemberForView[]>();
  for (const m of args.members) {
    const bucket = membersByList.get(m.contactListId);
    if (bucket) {
      bucket.push(m);
    } else {
      membersByList.set(m.contactListId, [m]);
    }
  }

  const lists: ListDetail[] = args.lists.map((list) => {
    const listMembers = membersByList.get(list.id) ?? [];
    const identifiers = listMembers.map((m) => toIdentifierFields(m.contact));
    const readiness = summarizeContactReadiness(identifiers);

    const sorted = [...listMembers].sort(
      (a, b) => b.addedAt.getTime() - a.addedAt.getTime(),
    );
    const recentMembers: MemberPreview[] = sorted
      .slice(0, previewSize)
      .map((m) => {
        const status = readinessStatusLabel(
          classifyContactReadiness(toIdentifierFields(m.contact)),
        );
        return {
          id: m.contact.id,
          displayName: buildDisplayName(m.contact),
          company: nonEmptyString(m.contact.company),
          email: nonEmptyString(m.contact.email),
          status,
        };
      });

    return {
      id: list.id,
      name: list.name,
      description: nonEmptyString(list.description),
      clientId: list.clientId,
      createdAt: list.createdAt,
      updatedAt: list.updatedAt,
      createdByName: nonEmptyString(list.createdByName),
      memberCount: listMembers.length,
      readiness,
      statusLabel: chooseStatusLabel({
        memberCount: listMembers.length,
        emailSendable: readiness.emailSendable,
      }),
      hasSuppression: readiness.suppressed > 0,
      recentMembers,
    };
  });

  // Page-wide totals are computed on **unique contacts** across all lists so
  // a contact that sits in two lists is not counted twice.
  const uniqueContactMap = new Map<string, ContactIdentifierFields>();
  for (const m of args.members) {
    if (!uniqueContactMap.has(m.contact.id)) {
      uniqueContactMap.set(m.contact.id, toIdentifierFields(m.contact));
    }
  }
  const uniqueContacts = summarizeContactReadiness(
    Array.from(uniqueContactMap.values()),
  );

  return {
    lists,
    totals: {
      totalLists: args.lists.length,
      uniqueContacts,
    },
  };
}
