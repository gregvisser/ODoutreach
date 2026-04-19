import "server-only";

/**
 * Safe display metadata for the Google service account used for Sheets suppression sync.
 * Never exposes private_key or full JSON — only whether credentials exist and the public client_email.
 */
export type GoogleServiceAccountDisplayInfo = {
  configured: boolean;
  clientEmail: string | null;
};

function tryParseCredentialsObject(): Record<string, unknown> | null {
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64?.trim();
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  try {
    if (b64) {
      const json = Buffer.from(b64, "base64").toString("utf8");
      return JSON.parse(json) as Record<string, unknown>;
    }
    if (raw) {
      return JSON.parse(raw) as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Returns whether Google service account env is set and parses only `client_email` for UI.
 * Invalid JSON or missing fields yields configured: false and clientEmail: null (no throws).
 */
export function getGoogleServiceAccountDisplayInfo(): GoogleServiceAccountDisplayInfo {
  const hasEnv = !!(
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64?.trim() ||
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim()
  );
  if (!hasEnv) {
    return { configured: false, clientEmail: null };
  }

  const obj = tryParseCredentialsObject();
  if (!obj) {
    return { configured: false, clientEmail: null };
  }

  const email = obj.client_email;
  if (typeof email !== "string" || !email.trim()) {
    return { configured: false, clientEmail: null };
  }

  return { configured: true, clientEmail: email.trim() };
}
