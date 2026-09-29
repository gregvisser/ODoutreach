import "server-only";

import { lookup } from "node:dns/promises";

import {
  assessLogoUrl,
  isBlockedLogoAddress,
  LOGO_MAX_BYTES,
  logoContentType,
} from "@/lib/branding/logo-fetch-policy";
import { logger } from "@/lib/logger";

export type LogoBytes = {
  readonly body: Uint8Array;
  readonly contentType: string;
};

type LookupFn = typeof lookup;

const MAX_REDIRECTS = 3;

async function addressesArePublic(hostname: string, lookupImpl: LookupFn): Promise<boolean> {
  let records: { address: string }[];
  try {
    const found = await lookupImpl(hostname, { all: true, verbatim: true });
    records = Array.isArray(found) ? found : [found];
  } catch {
    return false;
  }
  if (records.length === 0) return false;
  return records.every((record) => !isBlockedLogoAddress(record.address));
}

function imageBytesLookRight(bytes: Uint8Array, contentType: string): boolean {
  if (contentType === "image/svg+xml") {
    const text = new TextDecoder().decode(bytes.slice(0, 800)).trimStart().toLowerCase();
    if (text.includes("<script") || text.includes("javascript:")) return false;
    return text.startsWith("<svg") || text.startsWith("<?xml") || text.includes("<svg");
  }
  if (bytes.length < 12) return false;
  if (contentType === "image/png") return bytes[0] === 0x89 && bytes[1] === 0x50;
  if (contentType === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8;
  if (contentType === "image/gif") return bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46;
  if (contentType === "image/webp") {
    return bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[8] === 0x57 && bytes[9] === 0x45;
  }
  return false;
}

/**
 * Fetch one logo onto our origin. Returns null when the URL, the DNS answer,
 * or the body is not something we will serve. Never throws for a bad target.
 */
export async function fetchClientLogoBytes(
  rawUrl: string,
  deps?: { fetchImpl?: typeof fetch; lookupImpl?: LookupFn },
): Promise<LogoBytes | null> {
  const fetchImpl = deps?.fetchImpl ?? fetch;
  const lookupImpl = deps?.lookupImpl ?? lookup;
  let current = rawUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const decision = assessLogoUrl(current);
    if (!decision.ok) {
      logger.warn(
        { scope: "client-logo", reason: decision.reason },
        "Refused a client logo URL",
      );
      return null;
    }
    const host = decision.url.hostname.replace(/^\[|\]$/g, "");
    if (!(await addressesArePublic(host, lookupImpl))) {
      logger.warn({ scope: "client-logo", host }, "Refused a client logo host");
      return null;
    }

    let response: Response;
    try {
      response = await fetchImpl(decision.url.toString(), {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(8_000),
        headers: {
          accept: "image/png,image/jpeg,image/gif,image/webp,image/svg+xml",
          "user-agent": "ODoutreach-logo-fetch",
        },
      });
    } catch (err) {
      const detail = err instanceof Error ? err.name : "fetch_failed";
      logger.warn({ scope: "client-logo", host, detail }, "Client logo fetch failed");
      return null;
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || hop === MAX_REDIRECTS) return null;
      current = new URL(location, decision.url).toString();
      continue;
    }
    if (!response.ok) {
      logger.warn(
        { scope: "client-logo", host, status: response.status },
        "Client logo host refused the image",
      );
      return null;
    }

    const contentType = logoContentType(response.headers.get("content-type"));
    if (!contentType) return null;
    const declared = Number(response.headers.get("content-length") ?? "0");
    if (Number.isFinite(declared) && declared > LOGO_MAX_BYTES) return null;

    const body = new Uint8Array(await response.arrayBuffer());
    if (body.byteLength === 0 || body.byteLength > LOGO_MAX_BYTES) return null;
    if (!imageBytesLookRight(body, contentType)) return null;
    return { body, contentType };
  }

  return null;
}
