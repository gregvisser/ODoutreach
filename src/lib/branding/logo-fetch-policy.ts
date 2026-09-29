/**
 * What a client-logo fetch is allowed to touch.
 *
 * Logos are copied through our own server so a customer site that refuses
 * browser hotlinking (403 on the page's Referer) still displays. The URL is
 * one a staff member pasted, so the fetch has to refuse private networks,
 * link-local metadata addresses, and non-image responses.
 */

const BLOCKED_HOSTS = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata.internal",
]);

export type LogoUrlDecision =
  | { ok: true; url: URL }
  | { ok: false; reason: string };

export function assessLogoUrl(raw: string): LogoUrlDecision {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "logo_url_invalid" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, reason: "logo_url_scheme" };
  }
  if (url.username || url.password) {
    return { ok: false, reason: "logo_url_credentials" };
  }
  if (url.port && url.port !== "80" && url.port !== "443") {
    return { ok: false, reason: "logo_url_port" };
  }
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host || BLOCKED_HOSTS.has(host) || host.endsWith(".localhost") || host.endsWith(".local")) {
    return { ok: false, reason: "logo_url_host" };
  }
  if (isBlockedLogoAddress(host)) {
    return { ok: false, reason: "logo_url_private" };
  }
  return { ok: true, url };
}

/** True for loopback, private, link-local, and carrier-grade NAT addresses. */
export function isBlockedLogoAddress(address: string): boolean {
  const ip = address.trim().toLowerCase();
  if (ip.includes(":")) return isBlockedIpv6(ip);
  const parts = ip.split(".");
  if (parts.length !== 4) return false;
  const nums = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : NaN));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = nums as [number, number, number, number];
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function isBlockedIpv6(ip: string): boolean {
  const normalized = ip.split("%")[0] ?? ip;
  if (normalized === "::1" || normalized === "::") return true;
  if (normalized.startsWith("fe80:") || normalized.startsWith("fc") || normalized.startsWith("fd")) {
    return true;
  }
  const mapped = normalized.match(/::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped?.[1]) return isBlockedLogoAddress(mapped[1]);
  return false;
}

const LOGO_CONTENT_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
]);

export const LOGO_MAX_BYTES = 1_500_000;

export function logoContentType(header: string | null): string | null {
  if (!header) return null;
  const type = header.split(";")[0]?.trim().toLowerCase() ?? "";
  return LOGO_CONTENT_TYPES.has(type) ? type : null;
}

/**
 * Where the staff UI should load a saved logo from.
 * A client id uses our proxy. A preview with no id uses the pasted URL.
 */
export function clientLogoSrc(args: {
  clientId?: string | null;
  logoUrl: string | null;
}): string | null {
  const logoUrl = args.logoUrl?.trim() ?? "";
  if (!logoUrl) return null;
  const clientId = args.clientId?.trim() ?? "";
  if (!clientId) return logoUrl;
  return `/api/clients/${encodeURIComponent(clientId)}/logo`;
}
