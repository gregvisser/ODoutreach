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

/**
 * Every domain string that could be on a suppression list and still cover
 * `raw` — i.e. `raw` itself plus each of its parent domains.
 *
 *   newsletter.bt.com -> ["newsletter.bt.com", "bt.com"]
 *   mail.corp.bt.com  -> ["mail.corp.bt.com", "corp.bt.com", "bt.com"]
 *   bt.com            -> ["bt.com"]
 *
 * Why this exists: suppression used to be an EXACT match, so suppressing
 * `bt.com` did not stop a send to `someone@newsletter.bt.com`. Almost nobody
 * who writes a domain on a do-not-contact list means "the apex only".
 *
 * Splitting on label boundaries — not on string suffix — is what keeps this
 * safe. `notbt.com` yields only ["notbt.com"], and `bt.com.evil.net` (which is
 * registered under evil.net and is not BT) never yields "bt.com". A naive
 * `endsWith` check would wrongly block the first and a naive `includes` the
 * second.
 *
 * Stops at two labels, so a bare public suffix is never a candidate: a stray
 * "com" row could not blackhole every send. It does NOT consult the Public
 * Suffix List, so an explicitly stored multi-part suffix (e.g. someone typing
 * "co.uk" into the sheet) would still over-block — that is a bad row to store,
 * not a matching bug, and it requires a human to have typed it.
 *
 * DELIBERATELY NOT HANDLED: related company domains. Whether "do not contact
 * bt.com" also covers `bteurope.com` is a business rule and the client's call.
 * It cannot be derived from the string and must never be guessed here.
 */
export function suppressionDomainCandidates(raw: string): string[] {
  const d = normalizeDomain(raw);
  if (!d || !isValidDomainFormat(d)) return [];
  const labels = d.split(".");
  const out: string[] = [];
  for (let i = 0; i + 2 <= labels.length; i += 1) {
    out.push(labels.slice(i).join("."));
  }
  return out;
}

export function isValidDomainFormat(domain: string): boolean {
  const d = normalizeDomain(domain);
  if (!d || d.includes("@") || d.includes(" ")) return false;
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(d);
}
