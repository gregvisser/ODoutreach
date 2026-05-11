/**
 * Build the post-sign-in return path for the client Overview route, preserving
 * simple query params (e.g. `created=1`, `v=…`) without trusting arbitrary keys.
 */
export function buildClientOverviewCallbackPath(
  clientId: string,
  sp: Record<string, string | string[] | undefined>,
): string {
  const u = new URLSearchParams();
  for (const [key, raw] of Object.entries(sp)) {
    if (typeof raw === "string" && raw.length > 0) {
      u.set(key, raw);
    } else if (Array.isArray(raw) && typeof raw[0] === "string" && raw[0].length > 0) {
      u.set(key, raw[0]);
    }
  }
  const q = u.toString();
  return `/clients/${clientId}${q ? `?${q}` : ""}`;
}
