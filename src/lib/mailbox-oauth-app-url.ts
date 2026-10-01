/**
 * Public origin for OAuth redirect URIs (mailbox connection). Prefer AUTH_URL in all environments.
 */
export function getAppBaseUrl(): string {
  const explicit = process.env.AUTH_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/+$/, "");
  }
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    const host = vercel.replace(/^https?:\/\//, "");
    return `https://${host}`;
  }
  return "http://localhost:3000";
}

export function mailboxOAuthCallbackUrl(
  provider: "microsoft" | "google",
  origin?: string | null,
): string {
  const base = (origin?.trim() || getAppBaseUrl()).replace(/\/+$/, "");
  return `${base}/api/mailbox-oauth/${provider}/callback`;
}
