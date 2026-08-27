/**
 * Asking Microsoft which tenant a domain belongs to.
 *
 * ## Why this is not Microsoft Graph
 *
 * The commitment to the client named Graph. Graph is the wrong door, and this
 * was checked rather than assumed (2026-08-27):
 *
 * * `GET /v1.0/organization` returns `verifiedDomains`, but only for the tenant
 *   whose token you are holding. It answers "which domains are ours", never
 *   "which tenant is theirs". It cannot see a prospect's tenant at all.
 * * `GET /v1.0/tenantRelationships/findTenantInformationByDomainName(...)` DOES
 *   answer the question, and returns **401 unauthenticated** when called
 *   without a token. Using it would mean adding the
 *   `CrossTenantInformation.ReadBasic.All` application permission to the
 *   OpensDoors app registration and getting an administrator to consent — a new
 *   standing permission over cross-tenant data, for a fact that is already
 *   public.
 *
 * The OpenID Connect discovery document below is that same fact, published by
 * Microsoft with no authentication, no token, no consent and no new permission
 * on anybody's tenant. `issuer` carries the tenant id. It is used instead, and
 * the client should be told it is tenant matching done a simpler way — not that
 * the promise was dropped.
 *
 * ## What a null means
 *
 * A domain that is in no tenant returns AADSTS90002 rather than a fallback
 * (verified live against `bteurope.com` and a nonsense domain). Every failure
 * here — not in a tenant, throttled, timed out, offline — collapses to `null`,
 * and `tenantLink` refuses to match two nulls. The failure direction is
 * therefore always "no link found", never "a link to the wrong company".
 *
 * ## Cost
 *
 * One request per distinct domain, memoised for the life of a run and shared
 * across clients, because tenancy does not change between two clients resolved
 * a minute apart. Concurrency is held well below the DNS path's: this is
 * somebody else's HTTPS endpoint, not a local resolver.
 */

/** Resolve a domain to its Microsoft tenant id, or null. Injectable for tests. */
export type TenantLookup = (domain: string) => Promise<string | null>;

const DISCOVERY_TIMEOUT_MS = 8_000;

/** A GUID as it appears in an `issuer` URL. */
const ISSUER_TENANT = /login\.microsoftonline\.com\/([0-9a-f-]{36})\/v2\.0/i;

/**
 * The live lookup. One unauthenticated GET; anything unexpected is a null.
 *
 * `common`, `organizations` and `consumers` are Microsoft's own routing aliases
 * rather than domains, and are refused before the request is made — resolving
 * one would return a well-known GUID that every caller would then appear to
 * share.
 */
export const liveTenantLookup: TenantLookup = async (domain) => {
  const host = domain.trim().toLowerCase();
  if (!host || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) return null;
  if (host === "common" || host === "organizations" || host === "consumers") {
    return null;
  }

  try {
    const response = await fetch(
      `https://login.microsoftonline.com/${encodeURIComponent(host)}/v2.0/.well-known/openid-configuration`,
      {
        // No credentials of any kind, deliberately — see the header note.
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS),
      },
    );
    // 400 with AADSTS90002 is the normal "not in any tenant" answer, and is a
    // null like every other non-200.
    if (!response.ok) return null;

    const body: unknown = await response.json();
    const issuer =
      body !== null && typeof body === "object" && "issuer" in body
        ? (body as { issuer?: unknown }).issuer
        : undefined;
    if (typeof issuer !== "string") return null;

    return ISSUER_TENANT.exec(issuer)?.[1]?.toLowerCase() ?? null;
  } catch {
    return null;
  }
};

/**
 * Wrap a lookup so each domain is asked about once per run.
 *
 * In-memory and run-scoped on purpose. A cache TABLE would be more schema for
 * no gain and would let a stale row keep a domain linked to a tenant it has
 * since left — the same reasoning that kept the DNS path cache-free.
 */
export function memoiseTenantLookup(lookup: TenantLookup): TenantLookup {
  const cache = new Map<string, Promise<string | null>>();
  return (domain) => {
    const key = domain.trim().toLowerCase();
    const hit = cache.get(key);
    if (hit) return hit;
    const pending = lookup(key);
    cache.set(key, pending);
    return pending;
  };
}

/**
 * Resolve many domains, bounded.
 *
 * Domains that fail are simply absent from the map rather than present as null,
 * so a caller cannot accidentally treat "we could not ask" as a value.
 */
export async function resolveTenants(input: {
  domains: readonly string[];
  lookup: TenantLookup;
  concurrency?: number;
}): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const queue = input.domains[Symbol.iterator]();
  const workers = Math.max(1, input.concurrency ?? TENANT_CONCURRENCY);

  await Promise.all(
    Array.from({ length: workers }, async () => {
      for (const domain of queue) {
        // One domain must never take down a run. A throw is a null is a
        // domain we simply do not know about.
        let tenantId: string | null = null;
        try {
          tenantId = await input.lookup(domain);
        } catch {
          continue;
        }
        if (tenantId) out.set(domain.trim().toLowerCase(), tenantId);
      }
    }),
  );

  return out;
}

/**
 * Measured at 5ms per lookup against the live endpoint on 2026-08-27, so this
 * sweeps the whole 16,700-domain universe in about 80 seconds. Higher would be
 * faster and no more correct; this is somebody else's service.
 */
export const TENANT_CONCURRENCY = 16;

/**
 * May a near-certain tenant match block a domain WITHOUT anybody being asked?
 * Default OFF.
 *
 * This flag is the one thing in this feature that is not a decision for code to
 * make. Turning it on reverses RULING 3 — machine-created family membership —
 * and silently removes prospects from a paying client's universe. Both of those
 * belong to Greg, so the mechanism ships built, tested and proven to fire, with
 * the switch left off and the evidence written down.
 *
 * With the flag off, a tenant match is raised as a question exactly like every
 * other proposal. Nothing about the send gate changes either way: a block is a
 * `SuppressedDomainFamily` row whichever hand wrote it.
 */
export function isTenantAutoBlockEnabled(): boolean {
  const raw = process.env.SUPPRESSION_TENANT_AUTO_BLOCK_ENABLED?.trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "on" || raw === "yes";
}
