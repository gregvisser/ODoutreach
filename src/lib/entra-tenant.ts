/** Parse directory (tenant) id from a single-tenant Entra v2 issuer URL. */
export function getTenantIdFromEntraIssuer(issuer: string | undefined): string | null {
  if (!issuer) return null;
  const m = issuer
    .trim()
    .match(/login\.microsoftonline\.com\/([0-9a-fA-F-]{36})\//);
  return m ? m[1].toLowerCase() : null;
}
