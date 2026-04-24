/** Parse directory (tenant) id from a single-tenant Entra v2 issuer URL. */
export function getTenantIdFromEntraIssuer(issuer: string | undefined): string | null {
  if (!issuer) return null;
  const m = issuer
    .trim()
    .match(/login\.microsoftonline\.com\/([0-9a-fA-F-]{36})\//);
  return m ? m[1].toLowerCase() : null;
}

const MULTI_TENANT_ISSUER_MARKERS = /login\.microsoftonline\.com\/(common|organizations)\//i;

/**
 * True when `AUTH_MICROSOFT_ENTRA_ID_ISSUER` points at the multi-tenant
 * authority (`/common/` or `/organizations/`) so `profile.tid` must be
 * allowlisted with `ALLOWED_ENTRA_TENANT_IDS`.
 */
export function isMultiTenantEntraIssuer(issuer: string | undefined): boolean {
  if (!issuer) return false;
  return MULTI_TENANT_ISSUER_MARKERS.test(issuer.trim());
}

/**
 * Comma-separated Entra directory (tenant) UUIDs allowed to sign in when
 * using a multi-tenant authority. Must be set for production multi-tenant
 * apps; empty with a multi-tenant issuer fails closed in
 * {@link isEntraSignInAllowed}.
 */
export function getAllowedEntraTenantIdsFromEnv(): string[] {
  const raw = process.env.ALLOWED_ENTRA_TENANT_IDS?.trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^[0-9a-f-]{36}$/u.test(s));
}

/**
 * Enforces single-tenant issuer match, or multi-tenant allowlist. MFA is
 * still entirely in Entra / Conditional Access — this only gates which
 * tenants may complete OAuth for this app registration.
 */
export function isEntraSignInAllowed(
  entraIssuer: string | undefined,
  profileTid: string | undefined,
): boolean {
  if (isMultiTenantEntraIssuer(entraIssuer)) {
    if (!profileTid) {
      return false;
    }
    const allow = getAllowedEntraTenantIdsFromEnv();
    if (allow.length === 0) {
      return false;
    }
    return allow.includes(profileTid.toLowerCase());
  }

  const expected = getTenantIdFromEntraIssuer(entraIssuer);
  if (!expected) {
    return true;
  }
  if (!profileTid) {
    return true;
  }
  return profileTid.toLowerCase() === expected;
}
