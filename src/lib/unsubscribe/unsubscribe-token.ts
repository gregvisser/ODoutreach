/**
 * PR M — One-click unsubscribe token helpers.
 *
 * Pure helpers with no Prisma, no React, no environment reads. The
 * server-side unsubscribe service (`src/server/unsubscribe/unsubscribe-service.ts`)
 * composes these with the database layer.
 *
 * Token design:
 *   * Raw token = 32 random bytes, base64url-encoded (43 chars, no
 *     padding). Long enough to make brute-forcing the token space
 *     infeasible even at internet-scale request rates.
 *   * Only the SHA-256 hex hash is persisted. A leaked database dump
 *     cannot be used to forge unsubscribe links for other recipients.
 *   * Token URLs are shaped `<baseUrl>/unsubscribe/<rawToken>` so both
 *     GET (confirmation page) and POST (one-click header handler)
 *     resolve the same route.
 *   * Email normalization reuses the existing `normalizeEmail` helper
 *     so the suppression keying is identical to the governed-test and
 *     reply paths.
 */
import { createHash, randomBytes } from "node:crypto";

import { extractDomainFromEmail, normalizeEmail } from "@/lib/normalize";

/**
 * Length in raw bytes of the unsubscribe token. 32 bytes = 256 bits of
 * entropy, same order as a modern session secret. Encoded as base64url
 * the token is 43 characters with no padding.
 */
export const UNSUBSCRIBE_TOKEN_BYTES = 32;

/** Expected encoded length after base64url stripping — matches 32 raw bytes. */
export const UNSUBSCRIBE_TOKEN_ENCODED_LENGTH = 43;

/** Regex the public route uses to reject obviously-malformed tokens quickly. */
export const UNSUBSCRIBE_TOKEN_SHAPE = /^[A-Za-z0-9_-]{20,128}$/;

/**
 * Generate a fresh raw unsubscribe token. Caller stores only
 * `hashUnsubscribeToken(raw)` — the raw value goes into the outbound
 * email body and the `List-Unsubscribe` header.
 */
export function generateRawUnsubscribeToken(): string {
  return randomBytes(UNSUBSCRIBE_TOKEN_BYTES).toString("base64url");
}

/**
 * Deterministic SHA-256 hex hash of a raw token. Same input always
 * yields the same 64-char lowercase hex string, so repeated calls from
 * the public route/service layer can `findUnique` by `tokenHash`.
 */
export function hashUnsubscribeToken(raw: string): string {
  if (typeof raw !== "string" || raw.length === 0) {
    throw new Error("hashUnsubscribeToken: raw token is empty.");
  }
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

/**
 * Build the public unsubscribe URL. `baseUrl` should be the public
 * origin of the app (e.g. `https://opensdoors.bidlow.co.uk`) — the
 * helper strips any trailing slash and joins on `/unsubscribe/{token}`
 * so a single pattern handles both GET (confirmation page) and POST
 * (one-click header handler).
 */
export function buildUnsubscribeUrl(input: {
  baseUrl: string;
  rawToken: string;
}): string {
  const base = input.baseUrl.trim().replace(/\/+$/, "");
  if (!base) {
    throw new Error("buildUnsubscribeUrl: baseUrl is empty.");
  }
  if (!UNSUBSCRIBE_TOKEN_SHAPE.test(input.rawToken)) {
    throw new Error("buildUnsubscribeUrl: rawToken has invalid shape.");
  }
  return `${base}/unsubscribe/${input.rawToken}`;
}

/** Normalize an email the same way suppression/sending paths do. */
export function normaliseUnsubscribeEmail(raw: string | null | undefined): string {
  if (typeof raw !== "string") return "";
  const normalised = normalizeEmail(raw);
  return normalised;
}

/** Extract the lowercase domain component, or `null` if none. */
export function deriveEmailDomain(
  email: string | null | undefined,
): string | null {
  if (typeof email !== "string" || email.length === 0) return null;
  const domain = extractDomainFromEmail(email);
  return domain.length > 0 ? domain : null;
}

/**
 * Visually mask an email for the public confirmation page. We keep
 * enough of the local-part and domain for the recipient to recognise
 * their own address while avoiding leaking full addresses to anyone
 * who got the link.
 *
 * Examples:
 *   - `alex@bidlow.co.uk` -> `a***@bidlow.co.uk`
 *   - `a@bidlow.co.uk`    -> `*@bidlow.co.uk`
 *   - `bob@x.io`          -> `b***@x.io`
 */
export function maskEmailForDisplay(email: string | null | undefined): string {
  const normalised = normaliseUnsubscribeEmail(email);
  if (!normalised || !normalised.includes("@")) return "(unknown recipient)";
  const [local, domain] = normalised.split("@");
  if (!local || !domain) return "(unknown recipient)";
  const prefix = local.length <= 1 ? "*" : `${local[0] ?? ""}***`;
  return `${prefix}@${domain}`;
}
