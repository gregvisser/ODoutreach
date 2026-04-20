/**
 * PR D2 — pure policy helpers for `ContactList` / `ContactListMember`.
 *
 * These helpers contain no DB access so they can be unit-tested without a
 * Prisma client. The DB-facing helpers live in `contact-lists.ts`.
 */

/** Raw operator input for list selection on an import form. */
export type ImportListTargetInput = {
  existingListId?: string | null;
  newListName?: string | null;
};

/** Normalized list-target decision. */
export type ImportListTarget =
  | { kind: "existing"; listId: string }
  | { kind: "new"; listName: string };

/**
 * Validates the operator's list pick.
 * - Prefers an explicit `existingListId` when both are provided.
 * - Requires at least one of them to be non-empty — loose imports are blocked
 *   (§0.2 of docs/ops/UNIVERSAL_CONTACTS_AND_LISTS_PLAN).
 */
export function resolveImportListTarget(
  input: ImportListTargetInput,
): ImportListTarget | { error: string } {
  const existing =
    typeof input.existingListId === "string" ? input.existingListId.trim() : "";
  if (existing.length > 0) {
    return { kind: "existing", listId: existing };
  }
  const normalized = normalizeContactListName(input.newListName ?? "");
  if (normalized.length === 0) {
    return {
      error:
        "Choose an existing list or enter a new list name before importing.",
    };
  }
  if (normalized.length > 120) {
    return { error: "List name must be 120 characters or fewer." };
  }
  return { kind: "new", listName: normalized };
}

/** Trim + collapse interior whitespace so "  Foo   Bar " becomes "Foo Bar". */
export function normalizeContactListName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

/**
 * Pure scope-assert helper (no DB). Throws on any mismatch so the caller can
 * return a clean error before the DB trigger fires. Mirrors the server
 * trigger's three invariants:
 *   1. `member.clientId === contact.clientId`
 *   2. if `list.clientId` is set, `member.clientId === list.clientId`
 *   3. all contacts in a single write share the required client scope
 */
export function assertContactListClientScope(args: {
  list: { id: string; clientId: string | null };
  contacts: readonly { id: string; clientId: string }[];
  requiredClientId: string;
}): void {
  const { list, contacts, requiredClientId } = args;
  if (!requiredClientId) {
    throw new Error("SCOPE_REQUIRED_CLIENT_ID_MISSING");
  }
  if (list.clientId != null && list.clientId !== requiredClientId) {
    throw new Error("SCOPE_LIST_CLIENT_MISMATCH");
  }
  for (const c of contacts) {
    if (c.clientId !== requiredClientId) {
      throw new Error("SCOPE_CONTACT_CLIENT_MISMATCH");
    }
  }
}
