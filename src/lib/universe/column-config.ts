import { STAFF_VISIBLE_CONTACT_IMPORT_HEADERS } from "@/lib/contact-import-contract";

/**
 * PR #138 — Universe visible-column controls.
 *
 * The Universe table renders the twelve canonical contact fields (the same
 * contract used by the CSV importer and RocketReach panel) plus a few system
 * columns. Staff can hide/show individual contact-field columns via the
 * `cols=` URL parameter so wide tables stay readable.
 *
 * URL semantics:
 *   - `cols` omitted -> all twelve contact-field columns visible.
 *   - `cols=name,employer,industry` -> only those three contact-field columns
 *     visible. Unknown codes are ignored.
 *   - `cols=` (empty string) -> no contact-field columns visible (still
 *     useful for staff who only want Source / Last seen / Refs).
 *
 * System columns (selection checkbox, Source, Last seen, Refs) are NOT
 * toggleable — they are always rendered.
 */

/** Canonical column keys, one per row of the twelve-field staff contract. */
export const UNIVERSE_CONTACT_FIELD_COLUMNS = [
  { key: "name", label: STAFF_VISIBLE_CONTACT_IMPORT_HEADERS[0] },
  { key: "employer", label: STAFF_VISIBLE_CONTACT_IMPORT_HEADERS[1] },
  { key: "industry", label: STAFF_VISIBLE_CONTACT_IMPORT_HEADERS[2] },
  { key: "firstName", label: STAFF_VISIBLE_CONTACT_IMPORT_HEADERS[3] },
  { key: "lastName", label: STAFF_VISIBLE_CONTACT_IMPORT_HEADERS[4] },
  { key: "city", label: STAFF_VISIBLE_CONTACT_IMPORT_HEADERS[5] },
  { key: "country", label: STAFF_VISIBLE_CONTACT_IMPORT_HEADERS[6] },
  { key: "linkedin", label: STAFF_VISIBLE_CONTACT_IMPORT_HEADERS[7] },
  { key: "job1Title", label: STAFF_VISIBLE_CONTACT_IMPORT_HEADERS[8] },
  { key: "emails", label: STAFF_VISIBLE_CONTACT_IMPORT_HEADERS[9] },
  { key: "mobile", label: STAFF_VISIBLE_CONTACT_IMPORT_HEADERS[10] },
  { key: "office", label: STAFF_VISIBLE_CONTACT_IMPORT_HEADERS[11] },
] as const;

export type UniverseContactFieldKey =
  (typeof UNIVERSE_CONTACT_FIELD_COLUMNS)[number]["key"];

export const UNIVERSE_CONTACT_FIELD_KEYS: readonly UniverseContactFieldKey[] =
  UNIVERSE_CONTACT_FIELD_COLUMNS.map((c) => c.key);

export const ALL_UNIVERSE_CONTACT_FIELDS_VISIBLE = new Set<UniverseContactFieldKey>(
  UNIVERSE_CONTACT_FIELD_KEYS,
);

/**
 * Parse the `cols` URL parameter into the set of visible contact-field
 * column keys.
 *
 * - `undefined` (param not present) -> all twelve visible (legacy default).
 * - `""` (param present but empty) -> empty set (staff hid every column).
 * - `"name,employer,bogus"` -> `{ name, employer }` (unknown codes dropped).
 */
export function parseUniverseVisibleColumns(
  raw: string | null | undefined,
): Set<UniverseContactFieldKey> {
  if (raw === undefined || raw === null) {
    return new Set(UNIVERSE_CONTACT_FIELD_KEYS);
  }
  const valid = new Set(UNIVERSE_CONTACT_FIELD_KEYS);
  const result = new Set<UniverseContactFieldKey>();
  for (const piece of raw.split(",")) {
    const trimmed = piece.trim() as UniverseContactFieldKey;
    if (valid.has(trimmed)) result.add(trimmed);
  }
  return result;
}

/** Serialize the visible-column set back into the `cols=` URL param value. */
export function serializeUniverseVisibleColumns(
  visible: ReadonlySet<UniverseContactFieldKey>,
): string {
  return UNIVERSE_CONTACT_FIELD_KEYS.filter((k) => visible.has(k)).join(",");
}
