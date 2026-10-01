import { OPENSDOORS_ORGANISATION_ID } from "@/lib/tenant/organisation";

/** The live OpensDoors site. This host is never another organisation. */
export const OPENSDOORS_PUBLIC_HOST = "opensdoors.bidlow.co.uk";

const HOST_PATTERN =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export function normaliseRequestHost(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const first = raw.split(",")[0]?.trim().toLowerCase() ?? "";
  if (!first || first.includes("/") || first.includes("@") || first.includes(" ")) return null;
  const withoutBrackets = first.startsWith("[") ? first.slice(1).split("]")[0] ?? "" : first;
  const host = withoutBrackets.replace(/:\d+$/, "");
  if (!host || host === "." || host.startsWith(".") || host.endsWith(".")) return null;
  if (!/^[a-z0-9.-]+$/.test(host)) return null;
  return host;
}

/** localhost may keep a port. Public hosts never do. */
export function requestOriginHost(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const first = raw.split(",")[0]?.trim().toLowerCase() ?? "";
  if (!first || first.includes("/") || first.includes("@")) return null;
  const host = normaliseRequestHost(first);
  if (!host) return null;
  const port = /:(\d+)$/.exec(first)?.[1];
  if (host === "localhost" && port) return `${host}:${port}`;
  return host;
}

export function isReservedOpensDoorsHost(host: string): boolean {
  return host === OPENSDOORS_PUBLIC_HOST;
}

/**
 * Which organisation this browser host belongs to.
 *
 * `opensdoors.bidlow.co.uk` is OpensDoors even when a row claims it.
 * An unknown host is also OpensDoors, so a missing hostname or the Azure
 * default host cannot lock the existing customer out. A saved hostname
 * resolves to that organisation.
 */
export function resolveOrganisationIdForHost(
  rawHost: string | null | undefined,
  rows: readonly { id: string; hostname: string | null }[],
): string {
  const host = normaliseRequestHost(rawHost);
  if (!host || isReservedOpensDoorsHost(host) || host === "localhost") {
    return OPENSDOORS_ORGANISATION_ID;
  }
  const match = rows.find((row) => row.hostname === host);
  if (!match || match.id === OPENSDOORS_ORGANISATION_ID) return OPENSDOORS_ORGANISATION_ID;
  return match.id;
}

/**
 * Origin for a mailbox or sign-in redirect on this request.
 * Null means "use AUTH_URL", which is today's OpensDoors behaviour.
 * A host that is not reserved, localhost, the AUTH_URL host, or a saved
 * organisation hostname is refused so a forged Host cannot choose the redirect.
 */
export function safeAppOrigin(input: {
  requestHost: string | null | undefined;
  registeredHosts: readonly string[];
  authUrl: string | null | undefined;
}): string | null {
  const presented = requestOriginHost(input.requestHost);
  if (!presented) return null;
  const host = normaliseRequestHost(presented);
  if (!host) return null;
  let authHost: string | null = null;
  let authOrigin: string | null = null;
  const authUrl = input.authUrl?.trim();
  if (authUrl) {
    try {
      const url = new URL(authUrl);
      authHost = url.hostname.toLowerCase();
      authOrigin = url.origin;
    } catch {
      authHost = null;
    }
  }
  const registered = new Set(
    input.registeredHosts
      .map((item) => normaliseRequestHost(item))
      .filter((item): item is string => item !== null && !isReservedOpensDoorsHost(item)),
  );
  const allowed =
    isReservedOpensDoorsHost(host) ||
    host === "localhost" ||
    (authHost !== null && host === authHost) ||
    registered.has(host);
  if (!allowed) return null;
  if (authHost && host === authHost && authOrigin) return authOrigin;
  if (host === "localhost") return `http://${presented}`;
  return `https://${host}`;
}

/** Empty clears the hostname. Invalid text is rejected rather than stored. */
export function parseOrganisationHostname(
  raw: string,
  organisationId: string,
): { ok: true; hostname: string | null } | { ok: false; error: string } {
  const trimmed = raw.trim().toLowerCase().replace(/\.$/, "");
  if (!trimmed) return { ok: true, hostname: null };
  if (trimmed.includes("://") || trimmed.includes("/") || trimmed.includes(":") || trimmed.includes("*")) {
    return { ok: false, error: "Enter a hostname only, such as northwind.bidlow.co.uk." };
  }
  if (!HOST_PATTERN.test(trimmed)) {
    return { ok: false, error: "Enter a hostname only, such as northwind.bidlow.co.uk." };
  }
  if (isReservedOpensDoorsHost(trimmed) && organisationId !== OPENSDOORS_ORGANISATION_ID) {
    return { ok: false, error: "opensdoors.bidlow.co.uk stays OpensDoors." };
  }
  return { ok: true, hostname: trimmed };
}
