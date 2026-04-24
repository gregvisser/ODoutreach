/**
 * Validates operator input for Azure Maps Search before calling the provider.
 */
export const ADDRESS_SEARCH_MAX_LEN = 200;
export const ADDRESS_SEARCH_MIN_LEN = 3;

export type AddressSearchValidation =
  | { ok: true; query: string }
  | { ok: false; reason: "empty" | "too_short" | "too_long" | "trivial" };

const TRIVIAL = /^(?:\s*|[0-9\s\-.#]{0,2})$/i;

/**
 * @returns Normalized search text when the query is safe to send to the provider.
 */
export function validateAddressSearchInput(raw: string): AddressSearchValidation {
  const q = raw.trim().replace(/\s+/g, " ");
  if (q.length === 0) {
    return { ok: false, reason: "empty" };
  }
  if (q.length < ADDRESS_SEARCH_MIN_LEN) {
    return { ok: false, reason: "too_short" };
  }
  if (q.length > ADDRESS_SEARCH_MAX_LEN) {
    return { ok: false, reason: "too_long" };
  }
  if (TRIVIAL.test(q)) {
    return { ok: false, reason: "trivial" };
  }
  return { ok: true, query: q };
}
