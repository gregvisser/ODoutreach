import dns from "node:dns/promises";

import { prisma } from "@/lib/db";
import {
  isConsumerMailboxHost,
  parseDmarcRuaLinks,
  parseSpfRedirectLink,
  planFamilyProposals,
  tenantLink,
  type DiscoveredLink,
  type ExistingProposal,
  type ProposalPlan,
} from "@/server/suppression/family-discovery";
import {
  isTenantAutoBlockEnabled,
  liveTenantLookup,
  memoiseTenantLookup,
  resolveTenants,
  type TenantLookup,
} from "@/server/suppression/family-tenant";
import { companyNameFromDomain } from "@/lib/suppression/family-proposal-copy";

/**
 * Running family discovery for one client.
 *
 * Resolution runs from the CONTACT side, never the suppression side. There are
 * ~15,700 suppressed domains against ~966 contact domains, so walking the
 * suppression list would be sixteen times the work and could only ever surface
 * links that change no outcome. A contact domain that is already suppressed is
 * skipped too — it is blocked regardless.
 *
 * There is deliberately no per-domain cache table. The whole universe resolves
 * in about a minute at this concurrency, so the "cache" is simply that the job
 * runs on a schedule rather than on demand. A cache table would be more schema
 * for no gain, and a stale cache is a way to miss a domain that has just been
 * added to a client's list.
 *
 * NOTHING HERE IS ON THE SEND PATH. `evaluateSuppression` never reads proposals.
 * This writes questions; a human answers them.
 *
 * NO `server-only` MARKER, deliberately. This is a BATCH module, run by
 * `scripts/ops-family-proposals.ts` and, if it is ever scheduled, by a worker —
 * not from a request. `server-only` would make it unimportable by a tsx script,
 * and the alternative was duplicating the write path into the script, which is
 * how a report ends up describing code that is not the code that runs. The guard
 * it provides is redundant here anyway: this module imports `node:dns` and the
 * Prisma client, so a client bundle would fail on those first.
 */

/** c-ares defaults to ~5s x 4 tries; one black-holed nameserver would stall a run. */
const resolver = new dns.Resolver({ timeout: 3000, tries: 2 });

/** Concurrent DNS lookups. DNS is cheap; the limit exists to be a good citizen. */
const CONCURRENCY = 16;

export type TxtLookup = (name: string) => Promise<string[]>;

/**
 * TXT records with their chunks joined.
 *
 * `resolveTxt` returns `string[][]` — a record over 255 bytes arrives split, and
 * matching on the parts separately silently misses exactly the long records that
 * carry the most tags. Errors resolve to an empty list: a domain with no DMARC
 * is the normal case, not a failure.
 */
export const liveTxtLookup: TxtLookup = async (name) => {
  try {
    return (await resolver.resolveTxt(name)).map((chunks) => chunks.join(""));
  } catch {
    return [];
  }
};

/**
 * Read every contact domain's own published records and keep the links that
 * point at a domain this client has asked us not to contact.
 *
 * A link to a domain that is NOT suppressed is discarded here rather than
 * stored: it changes no outcome, and keeping it would turn the proposal store
 * into a map of the internet.
 */
export async function discoverLinksForClient(input: {
  contactDomains: readonly string[];
  suppressedDomains: ReadonlySet<string>;
  lookupTxt?: TxtLookup;
}): Promise<DiscoveredLink[]> {
  const lookup = input.lookupTxt ?? liveTxtLookup;
  const out: DiscoveredLink[] = [];

  const queue = input.contactDomains[Symbol.iterator]();
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (const domain of queue) {
        // Already suppressed: blocked either way, so there is nothing to ask.
        if (input.suppressedDomains.has(domain)) continue;

        // One domain must never take down a run of a thousand. A resolver that
        // throws is treated as "no records", which is also what a domain with
        // no DMARC looks like — the safe reading, since a missing record can
        // only ever mean FEWER proposals.
        let spfRecords: string[] = [];
        let dmarcRecords: string[] = [];
        try {
          [spfRecords, dmarcRecords] = await Promise.all([
            lookup(domain),
            lookup(`_dmarc.${domain}`),
          ]);
        } catch {
          continue;
        }

        for (const link of parseDmarcRuaLinks(domain, dmarcRecords)) {
          if (input.suppressedDomains.has(link.seedDomain)) out.push(link);
        }
        const spf = parseSpfRedirectLink(domain, spfRecords);
        if (spf && input.suppressedDomains.has(spf.seedDomain)) out.push(spf);
      }
    }),
  );

  return out;
}

/**
 * How much of the tenant sweep a run was allowed to do, and how much it used.
 *
 * Reported rather than assumed. A cap that silently truncates coverage is how a
 * job goes green while covering six per cent of the list, so `budgetExhausted`
 * travels all the way out to the endpoint response and the workflow log.
 */
export type TenantLegStats = {
  domainsResolved: number;
  lookupsSpent: number;
  budgetExhausted: boolean;
};

/**
 * The generous default. MEASURED 2026-08-27 against the live endpoint: 100
 * distinct real UK corporate domains resolved at 5ms each at concurrency 16, so
 * the whole current universe — 966 contact domains plus 15,714 suppressed —
 * sweeps in about 80 seconds. That fits inside the discovery request with room
 * to spare, so this budget sits ABOVE the real universe rather than inside it:
 * it is a tripwire for unexpected growth, not a throttle on normal operation.
 */
export const TENANT_LOOKUP_BUDGET = 25_000;

/**
 * Find contact domains sitting in the same Microsoft 365 tenant as a domain the
 * client has asked us not to contact.
 *
 * Both sides must be resolved — there is no endpoint that lists a tenant's
 * domains. `GetFederationInformation` used to, and was checked on 2026-08-27:
 * it now echoes back only the domain you asked about, so tenant enumeration is
 * closed and pairwise resolution is the only route.
 *
 * Consumer mailbox providers are dropped BEFORE any lookup is spent. That is
 * partly thrift and mostly the measured false positive: `gmail.com`,
 * `hotmail.com`, `live.com` and `yahoo.co.uk` share one tenant, and there is no
 * reason to spend a request discovering a link that must be discarded.
 */
export async function discoverTenantLinksForClient(input: {
  contactDomains: readonly string[];
  suppressedDomains: ReadonlySet<string>;
  lookupTenant?: TenantLookup;
  budget?: number;
}): Promise<{ links: DiscoveredLink[]; stats: TenantLegStats }> {
  const lookup = memoiseTenantLookup(input.lookupTenant ?? liveTenantLookup);
  const budget = input.budget ?? TENANT_LOOKUP_BUDGET;

  const candidates = input.contactDomains.filter(
    (d) => !input.suppressedDomains.has(d) && !isConsumerMailboxHost(d),
  );
  const seeds = [...input.suppressedDomains].filter(
    (d) => !isConsumerMailboxHost(d),
  );

  // Contact side first, always. It is the smaller list and the side that can
  // change an outcome, so if anything is going to be cut it must not be this.
  const spend = candidates.length + seeds.length;
  const budgetExhausted = spend > budget;
  const contactSlice = candidates.slice(0, budget);
  const seedSlice = seeds.slice(0, Math.max(0, budget - contactSlice.length));

  const [contactTenants, seedTenants] = await Promise.all([
    resolveTenants({ domains: contactSlice, lookup }),
    resolveTenants({ domains: seedSlice, lookup }),
  ]);

  // Group the suppressed side by tenant so the match is a map read, not a
  // 966 x 15,714 comparison.
  const seedsByTenant = new Map<string, string[]>();
  for (const [domain, tenantId] of seedTenants) {
    const bucket = seedsByTenant.get(tenantId) ?? [];
    bucket.push(domain);
    seedsByTenant.set(tenantId, bucket);
  }

  const links: DiscoveredLink[] = [];
  for (const [proposedDomain, tenantId] of contactTenants) {
    for (const seedDomain of seedsByTenant.get(tenantId) ?? []) {
      const link = tenantLink({
        proposedDomain,
        proposedTenantId: tenantId,
        seedDomain,
        seedTenantId: tenantId,
      });
      if (link) links.push(link);
    }
  }

  return {
    links,
    stats: {
      domainsResolved: contactTenants.size + seedTenants.size,
      lookupsSpent: contactSlice.length + seedSlice.length,
      budgetExhausted,
    },
  };
}

export type ClientDiscoveryResult = {
  clientId: string;
  contactDomainsChecked: number;
  suppressedDomainCount: number;
  links: DiscoveredLink[];
  plans: ProposalPlan[];
  tenant: TenantLegStats;
};

/**
 * Resolve one client and work out what to propose. **Reads only** — call
 * {@link persistProposalPlans} to write.
 *
 * Split this way so the read-only report the brief asks for runs the exact code
 * path that would write, rather than an approximation of it.
 */
export async function planClientFamilyProposals(input: {
  clientId: string;
  lookupTxt?: TxtLookup;
  lookupTenant?: TenantLookup;
  tenantBudget?: number;
}): Promise<ClientDiscoveryResult> {
  const [suppressedRows, contactCounts, existingRows] = await Promise.all([
    prisma.suppressedDomain.findMany({
      where: { clientId: input.clientId },
      select: { domain: true },
    }),
    // Grouped rather than DISTINCT: the blast radius of an automatic block is
    // decided from these counts, so the count has to come back with the domain.
    prisma.contact.groupBy({
      by: ["emailDomain"],
      where: { clientId: input.clientId, emailDomain: { not: null } },
      _count: { _all: true },
    }),
    prisma.suppressedDomainFamilyProposal.findMany({
      where: { clientId: input.clientId },
      select: { seedDomain: true, proposedDomain: true, status: true },
    }),
  ]);

  const suppressedDomains = new Set(suppressedRows.map((r) => r.domain));
  const contactsByDomain = new Map<string, number>();
  for (const row of contactCounts) {
    if (row.emailDomain) contactsByDomain.set(row.emailDomain, row._count._all);
  }
  const contactDomains = [...contactsByDomain.keys()];

  // The two legs are independent and neither can starve the other of a result,
  // so they run together rather than one after the other.
  const [dnsLinks, tenant] = await Promise.all([
    discoverLinksForClient({
      contactDomains,
      suppressedDomains,
      lookupTxt: input.lookupTxt,
    }),
    discoverTenantLinksForClient({
      contactDomains,
      suppressedDomains,
      lookupTenant: input.lookupTenant,
      budget: input.tenantBudget,
    }),
  ]);

  // Tenant links come FIRST. When both legs find the same pair the planner
  // keeps the first and drops the duplicate, and the tenant reading is the one
  // that carries ownership — and the only one allowed to block on its own.
  const links = [...tenant.links, ...dnsLinks];

  const existing: ExistingProposal[] = existingRows.map((r) => ({
    seedDomain: r.seedDomain,
    proposedDomain: r.proposedDomain,
    status: r.status,
  }));

  return {
    clientId: input.clientId,
    contactDomainsChecked: contactDomains.length,
    suppressedDomainCount: suppressedDomains.size,
    links,
    plans: planFamilyProposals({ links, existing, contactsByDomain }),
    tenant: tenant.stats,
  };
}

/**
 * Write the plan.
 *
 * Only `create` and `refresh` touch the database, and a `refresh` updates
 * evidence and fan-in on a row that is still `PENDING`. **Nothing here can move
 * a row out of `REJECTED`** — the planner never emits a write for one, and the
 * update below is scoped to `status: "PENDING"` as a second line of defence, so
 * even a future planner bug cannot resurrect a refused link.
 */
export async function persistProposalPlans(input: {
  clientId: string;
  plans: readonly ProposalPlan[];
  /**
   * Override the auto-block switch. The default reads the environment; tests
   * pass it explicitly so the behaviour is pinned rather than inherited.
   */
  autoBlockEnabled?: boolean;
}): Promise<{
  created: number;
  refreshed: number;
  skipped: number;
  autoBlocked: number;
}> {
  const autoBlockEnabled = input.autoBlockEnabled ?? isTenantAutoBlockEnabled();
  let created = 0;
  let refreshed = 0;
  let skipped = 0;
  let autoBlocked = 0;

  for (const plan of input.plans) {
    if (plan.kind === "skip") {
      skipped += 1;
      continue;
    }
    const { link, fanIn } = plan;

    if (plan.kind === "refresh") {
      const result = await prisma.suppressedDomainFamilyProposal.updateMany({
        // Scoped to PENDING deliberately — see the note above.
        where: {
          clientId: input.clientId,
          seedDomain: link.seedDomain,
          proposedDomain: link.proposedDomain,
          status: "PENDING",
        },
        data: { source: link.source, evidence: link.evidence, fanIn },
      });
      refreshed += result.count;
      continue;
    }

    try {
      const row = await prisma.suppressedDomainFamilyProposal.create({
        data: {
          clientId: input.clientId,
          seedDomain: link.seedDomain,
          proposedDomain: link.proposedDomain,
          source: link.source,
          evidence: link.evidence,
          fanIn,
        },
      });
      created += 1;

      // The promised behaviour: a near-certain match blocks on its own. The
      // proposal row is still written first, so an automatic block and a
      // human's answer leave the same audit trail and the same evidence — the
      // only difference is `decidedByStaffUserId`, which stays null.
      if (plan.autoBlock && autoBlockEnabled) {
        await applyAutoBlock({ clientId: input.clientId, proposalId: row.id });
        autoBlocked += 1;
      }
    } catch {
      // A concurrent run created it first. The unique constraint is the
      // authority; losing the race is not an error.
      skipped += 1;
    }
  }

  return { created, refreshed, skipped, autoBlocked };
}

/**
 * Turn a proposal into a block with no human in the loop.
 *
 * Deliberately a copy of `confirmFamilyProposal`'s transaction rather than a
 * call to it: that function takes a `staffUserId` and exists to record a
 * person's decision. Passing it a fake staff id would put a machine's block
 * behind somebody's name in the audit trail, which is the kind of small lie
 * that makes an audit trail worthless.
 *
 * `decidedByStaffUserId` and `createdByStaffUserId` both stay null, and that is
 * what the screen reads to say "we blocked this automatically".
 */
async function applyAutoBlock(input: {
  clientId: string;
  proposalId: string;
}): Promise<void> {
  const proposal = await prisma.suppressedDomainFamilyProposal.findFirst({
    where: { id: input.proposalId, clientId: input.clientId, status: "PENDING" },
  });
  if (!proposal) return;

  const label = companyNameFromDomain(proposal.seedDomain);

  await prisma.$transaction(async (tx) => {
    await tx.suppressedDomainFamilyProposal.updateMany({
      // Scoped to PENDING so a rejection landing between the read and the write
      // wins the race. A tombstone must never lose to a batch job.
      where: { id: proposal.id, clientId: input.clientId, status: "PENDING" },
      data: { status: "CONFIRMED", decidedAt: new Date() },
    });
    await tx.suppressedDomainFamily.upsert({
      where: {
        clientId_domain: {
          clientId: input.clientId,
          domain: proposal.proposedDomain,
        },
      },
      update: {
        sourceProposalId: proposal.id,
        discoveredSource: proposal.source,
        discoveredAt: proposal.discoveredAt,
      },
      create: {
        clientId: input.clientId,
        label,
        domain: proposal.proposedDomain,
        sourceProposalId: proposal.id,
        discoveredSource: proposal.source,
        discoveredAt: proposal.discoveredAt,
      },
    });
    // The seed anchors the family — without it the gate has nothing suppressed
    // to key the new member off.
    await tx.suppressedDomainFamily.upsert({
      where: {
        clientId_domain: { clientId: input.clientId, domain: proposal.seedDomain },
      },
      update: {},
      create: {
        clientId: input.clientId,
        label,
        domain: proposal.seedDomain,
      },
    });
  });
}
