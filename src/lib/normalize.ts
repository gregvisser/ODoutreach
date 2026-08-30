import { parse as parsePublicSuffix } from "tldts";

/** Shared normalization for emails and domains — keep in sync with suppression tables. */

const EMAIL_RE =
  /^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/i;

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Canonical identity for reply-MATCHING only: `normalizeEmail` plus stripping
 * a `+tag` suffix from the local part. Gmail (and other providers using the
 * same convention) drop the alias when a human hits Reply, so an outbound
 * sent to `user+tag@domain` and a reply arriving `From: user@domain` must be
 * recognised as the same mailbox or a plus-aliased send can never be matched
 * back to its own reply (row 100 — a real reply was filed against an older,
 * bare-address send instead of the one it actually replied to).
 *
 * Deliberately NOT used for suppression, unsubscribe or contact de-duplication
 * — those stay on the literal address on purpose, per RULING 3 in this file's
 * neighbouring domain-candidate logic: collapsing aliases there is a business
 * decision, not a string-matching one.
 */
export function canonicalizeEmailForMatching(raw: string): string {
  const n = normalizeEmail(raw);
  const at = n.indexOf("@");
  if (at < 0) return n;
  const local = n.slice(0, at).split("+")[0];
  return `${local}${n.slice(at)}`;
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
 * Bare public suffixes are never candidates. Stopping at two labels handled the
 * single-label case ("com"), but NOT a multi-part suffix: `someone@acme.co.uk`
 * used to yield ["acme.co.uk", "co.uk"], so one stored "co.uk" row — one typo,
 * one bad cell in a synced sheet — silently blackholed every .co.uk recipient
 * for that client as BLOCKED_SUPPRESSION. This now consults the real Public
 * Suffix List and drops any candidate that IS a suffix.
 *
 * `isStorableSuppressionDomain` is the matching guard on the write side, so
 * such a row cannot be created in the first place.
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
    const candidate = labels.slice(i).join(".");
    // Never widen to a public suffix — that is a whole-TLD blackhole.
    if (!isStorableSuppressionDomain(candidate)) continue;
    out.push(candidate);
  }
  return out;
}

/**
 * Whether a string is a real registrable domain rather than a public suffix.
 *
 * `isValidDomainFormat` is a SHAPE check — letters, digits, hyphens, at least
 * one dot — so it says yes to "co.uk" and "com". Storing either on a
 * do-not-contact list blackholes an entire TLD for that client, silently.
 *
 * Uses the real Public Suffix List via `tldts`, with `allowPrivateDomains` OFF
 * deliberately: only true ICANN suffixes are refused. A platform domain like
 * `github.io` stays storable, because blocking it is a deliberate choice rather
 * than a TLD-wide accident.
 *
 * NOTE: this is not inference and does not touch RULING 3. Refusing to store a
 * public suffix is rejecting an invalid entry, not guessing that two companies
 * are related.
 */
export function isStorableSuppressionDomain(domain: string): boolean {
  const d = normalizeDomain(domain);
  if (!d || !isValidDomainFormat(d)) return false;
  return parsePublicSuffix(d, { allowPrivateDomains: false }).domain !== null;
}

export function isValidDomainFormat(domain: string): boolean {
  const d = normalizeDomain(domain);
  if (!d || d.includes("@") || d.includes(" ")) return false;
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(d);
}
