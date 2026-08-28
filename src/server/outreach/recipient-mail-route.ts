import "server-only";

import { promises as dns } from "node:dns";

import { extractDomainFromEmail, normalizeEmail } from "@/lib/normalize";
import type { RecipientMailRoute } from "@/lib/safety/recipient-verification-policy";

/**
 * Recipient address verification — the lookup half.
 *
 * Asks the recipient's own nameservers whether there is anywhere for mail to
 * land. The decision about what to DO with the answer lives next door in
 * `src/lib/safety/recipient-verification-policy.ts`; this module only reports
 * facts.
 *
 * Cost: DNS, so nothing. This is deliberately the free half of list
 * verification — see the note in the policy module about what is not here.
 */

/**
 * Kill switch. Default ON.
 *
 * The repo's usual convention for send-path work is flag-gated default-OFF.
 * This one ships ON on purpose, and the reason is written down rather than
 * assumed: QUEUE.md records six occasions this week where something was built,
 * wired, reported success and never fired. A default-off flag is that outcome
 * by construction.
 *
 * Shipping ON is safe here because of how narrow the blocking condition is: the
 * gate can only block on a PROVEN-dead domain (NXDOMAIN, or no mail
 * destination). Every other outcome — including any failure of the check itself
 * — defers the row back onto the queue rather than failing it. The worst case
 * of a bug in this module is therefore delayed mail, not lost mail, and
 * `RECIPIENT_VERIFICATION_ENABLED=false` turns it off without a deploy.
 */
export function isRecipientVerificationEnabled(): boolean {
  return (process.env.RECIPIENT_VERIFICATION_ENABLED ?? "").trim().toLowerCase() !== "false";
}

/** The subset of `node:dns` this module needs — injectable so tests need no network. */
export type MailRouteResolver = {
  resolveMx: (hostname: string) => Promise<{ exchange: string; priority: number }[]>;
  resolve4: (hostname: string) => Promise<string[]>;
  resolve6: (hostname: string) => Promise<string[]>;
};

const nodeResolver: MailRouteResolver = {
  resolveMx: (h) => dns.resolveMx(h),
  resolve4: (h) => dns.resolve4(h),
  resolve6: (h) => dns.resolve6(h),
};

/** "The domain exists but has no record of this type." */
const NO_SUCH_RECORD = new Set(["ENODATA", "ENOTFOUND"]);
/** "The domain itself does not exist." */
const NO_SUCH_DOMAIN = "ENOTFOUND";

function dnsErrorCode(e: unknown): string {
  const code = (e as { code?: unknown })?.code;
  return typeof code === "string" ? code : "EUNKNOWN";
}

/**
 * RFC 7505 null MX: a single MX whose exchange is "." is an explicit,
 * standards-blessed declaration of "this domain sends no mail and receives
 * none". Honouring it is the difference between a correct block and a wrong one.
 */
function hasUsableExchange(records: { exchange: string }[]): boolean {
  return records.some((r) => {
    const e = (r.exchange ?? "").trim().replace(/\.$/, "");
    return e.length > 0;
  });
}

/**
 * Resolve where mail for `domain` should go.
 *
 * MX first; on "no MX record" fall back to A/AAAA, because RFC 5321 §5.1 makes
 * an address record an implicit mail exchanger. Skipping that fallback would
 * block genuinely reachable domains — a small but real class of older company
 * domains.
 *
 * Any error that is not one of the two "no such record" codes is reported as
 * `unknown`, never as a bad domain. SERVFAIL, ETIMEOUT and EREFUSED are facts
 * about the resolver.
 */
export async function lookupMailRoute(
  domain: string,
  resolver: MailRouteResolver = nodeResolver,
): Promise<RecipientMailRoute> {
  const d = domain.trim().toLowerCase();
  if (!d) return { status: "no_route" };

  try {
    const mx = await resolver.resolveMx(d);
    if (mx.length > 0) {
      if (hasUsableExchange(mx)) return { status: "has_route", via: "mx" };
      // Null MX — an explicit refusal, not a missing record. Do not fall back.
      return { status: "no_route" };
    }
  } catch (e) {
    const code = dnsErrorCode(e);
    if (!NO_SUCH_RECORD.has(code)) {
      return { status: "unknown", error: `MX lookup failed (${code})` };
    }
    // ENODATA / ENOTFOUND fall through to the address-record fallback below.
  }

  // No MX. Is there an address record acting as the implicit exchanger?
  let sawMissingDomain = false;
  for (const lookup of [resolver.resolve4, resolver.resolve6]) {
    try {
      const records = await lookup(d);
      if (records.length > 0) return { status: "has_route", via: "address_record" };
    } catch (e) {
      const code = dnsErrorCode(e);
      if (!NO_SUCH_RECORD.has(code)) {
        return { status: "unknown", error: `Address lookup failed (${code})` };
      }
      if (code === NO_SUCH_DOMAIN) sawMissingDomain = true;
    }
  }

  // Nothing at all resolved. ENOTFOUND on the address lookups means the name
  // itself is absent; ENODATA means it exists but publishes no mail route.
  return sawMissingDomain ? { status: "domain_missing" } : { status: "no_route" };
}

// ── Cache ───────────────────────────────────────────────────────────────────
// One outreach batch hits the same handful of recipient domains repeatedly, so
// without this the gate would re-ask DNS the same question dozens of times.
//
// Positive answers are held longer than negative ones deliberately: a domain
// that has just been set up must not stay blocked for hours because we asked
// too early. `unknown` is never cached — caching a resolver hiccup would spread
// one bad moment across every send that followed it.
const POSITIVE_TTL_MS = 6 * 60 * 60 * 1000; // 6h
const NEGATIVE_TTL_MS = 30 * 60 * 1000; // 30m

type CacheEntry = { route: RecipientMailRoute; expiresAt: number };
const cache = new Map<string, CacheEntry>();

/** Test seam — the cache is process-global, so suites must be able to reset it. */
export function clearMailRouteCache(): void {
  cache.clear();
}

export async function lookupMailRouteCached(
  domain: string,
  now: number = Date.now(),
  resolver: MailRouteResolver = nodeResolver,
): Promise<RecipientMailRoute> {
  const d = domain.trim().toLowerCase();
  const hit = cache.get(d);
  if (hit && hit.expiresAt > now) return hit.route;

  const route = await lookupMailRoute(d, resolver);
  if (route.status !== "unknown") {
    cache.set(d, {
      route,
      expiresAt: now + (route.status === "has_route" ? POSITIVE_TTL_MS : NEGATIVE_TTL_MS),
    });
  }
  return route;
}

/**
 * Look up the mail route for the domain of `email`.
 *
 * Returns null when the address has no extractable domain — the policy module
 * blocks that as malformed and does not need a DNS answer to do it.
 */
export async function lookupMailRouteForAddress(
  email: string,
  now: number = Date.now(),
  resolver: MailRouteResolver = nodeResolver,
): Promise<RecipientMailRoute | null> {
  const domain = extractDomainFromEmail(normalizeEmail(email ?? ""));
  if (!domain) return null;
  return await lookupMailRouteCached(domain, now, resolver);
}
