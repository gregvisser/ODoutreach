/**
 * PR M — One-click unsubscribe readiness helper.
 *
 * Centralises the policy check used by send governance call sites to
 * decide whether one-click unsubscribe is wired end-to-end.
 *
 * Returns `true` only when:
 *   * a public base URL is configured (AUTH_URL or INTERNAL_APP_URL),
 *     so the link we plant in outbound emails resolves to something
 *     the recipient's browser can open; AND
 *   * the public base URL is an absolute `http(s)` origin — localhost
 *     is accepted so local dev flows still mark the feature as ready.
 *
 * Real prospect sends still require LIVE_PROSPECT launch approval,
 * operator confirmation, and suppression/capacity checks — this
 * helper only reports whether the unsubscribe rail is wired.
 */

/** Trim + fallback resolution for the public base URL. */
export function resolvePublicBaseUrl(): string | null {
  const envs = [
    process.env.AUTH_URL,
    process.env.INTERNAL_APP_URL,
    process.env.NEXT_PUBLIC_APP_URL,
  ];
  for (const raw of envs) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    try {
      const u = new URL(trimmed);
      if (u.protocol === "http:" || u.protocol === "https:") {
        return trimmed.replace(/\/+$/, "");
      }
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Pure predicate used by send governance call sites. See
 * `src/lib/clients/client-send-governance.ts` for how the result maps
 * to the real-prospect gate.
 */
export function isOneClickUnsubscribeReady(): boolean {
  return resolvePublicBaseUrl() !== null;
}
