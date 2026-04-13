import "server-only";

/**
 * Loads Google service account JSON from env.
 * Prefer `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` in production to avoid escaping issues.
 */
export function loadServiceAccountCredentials(): Record<string, unknown> {
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64?.trim();
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (b64) {
    const json = Buffer.from(b64, "base64").toString("utf8");
    return JSON.parse(json) as Record<string, unknown>;
  }
  if (raw) {
    return JSON.parse(raw) as Record<string, unknown>;
  }
  throw new Error(
    "Missing GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_SERVICE_ACCOUNT_JSON_BASE64",
  );
}

export function hasGoogleServiceAccountConfig(): boolean {
  return !!(
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64?.trim() ||
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim()
  );
}
