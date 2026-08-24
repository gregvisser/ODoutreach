import {
  extractDomainFromEmail,
  isStorableSuppressionDomain,
  isValidDomainFormat,
  isValidEmailFormat,
  normalizeDomain,
  normalizeEmail,
} from "@/lib/normalize";

/**
 * Validation/normalization for the in-app "Add to do-not-contact" action.
 *
 * Staff paste all sorts of things: a bare email, a domain, a full URL, or
 * an email when they meant the domain. This normalizes to exactly what the
 * suppression tables store (same normalize helpers the send-time gate
 * uses), so a manual add blocks sends identically to a sheet-synced row.
 *
 * Pure — exported for unit tests.
 */
export type ManualDncNormalized =
  | { ok: true; kind: "EMAIL"; value: string }
  | { ok: true; kind: "DOMAIN"; value: string }
  | { ok: false; error: string };

export function normalizeManualDncEntry(
  kind: "EMAIL" | "DOMAIN",
  raw: string,
): ManualDncNormalized {
  const input = (raw ?? "").trim();
  if (!input) {
    return { ok: false, error: "Enter an email address or domain first." };
  }

  if (kind === "EMAIL") {
    const email = normalizeEmail(input);
    if (!isValidEmailFormat(email)) {
      return {
        ok: false,
        error: "That doesn't look like a valid email address.",
      };
    }
    return { ok: true, kind: "EMAIL", value: email };
  }

  // DOMAIN: accept a bare domain, a URL, or a full email address (use its
  // domain part) — mirrors the cleaning the sheet sync applies to cells.
  const fromEmail = input.includes("@") ? extractDomainFromEmail(input) : input;
  const domain = normalizeDomain(fromEmail);
  if (!isValidDomainFormat(domain)) {
    return {
      ok: false,
      error: "That doesn't look like a valid domain (e.g. example.co.uk).",
    };
  }
  // A bare public suffix would blackhole an entire TLD for this client, and the
  // shape check above says yes to "co.uk". Refuse it with an error that names
  // the mistake rather than repeating "invalid domain".
  if (!isStorableSuppressionDomain(domain)) {
    return {
      ok: false,
      error: `"${domain}" is a domain ending, not a company domain. Blocking it would stop every address that ends that way. Enter the company's own domain, e.g. example${domain.startsWith(".") ? domain : `.${domain}`}.`,
    };
  }
  return { ok: true, kind: "DOMAIN", value: domain };
}
