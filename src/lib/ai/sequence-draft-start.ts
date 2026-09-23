/**
 * Shared by the sequence-draft button and its server action.
 *
 * On production the button was a server action with no catch. Next turns any
 * throw into a failed action, and `error.tsx` hides the real message behind
 * "The action didn't complete." That screen appears as soon as the throw
 * returns — well under a second for an auth, permission, or database failure
 * that happens before the model is called. The soft banner is only possible
 * when `redirect()` actually runs. These helpers keep that failure on the
 * templates page, and they never start a second draft.
 */

export const SEQUENCE_DRAFT_START_FAILED_MESSAGE =
  "The sequence could not be started. Nothing was drafted and nothing was sent.";

/** True when Next.js used `redirect()` (digest), which the router must handle. */
export function isSequenceDraftRedirectError(err: unknown): boolean {
  if (typeof err !== "object" || err === null || !("digest" in err)) return false;
  const digest = (err as { digest?: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

/**
 * Client ids are cuids. Anything else is refused so a crafted value cannot
 * change the path the action redirects to.
 */
export function sequenceDraftClientId(value: string): string | null {
  const id = value.trim();
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return null;
  return id;
}
