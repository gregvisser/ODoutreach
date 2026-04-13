/** Shared normalization for emails and domains — keep in sync with suppression tables. */

const EMAIL_RE =
  /^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/i;

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidEmailFormat(email: string): boolean {
  return EMAIL_RE.test(normalizeEmail(email));
}

export function extractDomainFromEmail(email: string): string {
  const n = normalizeEmail(email);
  const at = n.lastIndexOf("@");
  if (at < 0) return "";
  return n.slice(at + 1);
}

/** Normalize domain: lowercase, strip protocol, strip path, trim dots */
export function normalizeDomain(raw: string): string {
  let s = raw.trim().toLowerCase();
  s = s.replace(/^https?:\/\//, "");
  const slash = s.indexOf("/");
  if (slash >= 0) s = s.slice(0, slash);
  s = s.replace(/^www\./, "");
  return s.replace(/\.$/, "").trim();
}

export function isValidDomainFormat(domain: string): boolean {
  const d = normalizeDomain(domain);
  if (!d || d.includes("@") || d.includes(" ")) return false;
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(d);
}
