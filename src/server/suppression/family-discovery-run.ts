import dns from "node:dns/promises";

import { prisma } from "@/lib/db";
import {
  parseDmarcRuaLinks,
  parseSpfRedirectLink,
  planFamilyProposals,
  type DiscoveredLink,
  type ExistingProposal,
  type ProposalPlan,
} from "@/server/suppression/family-discovery";

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

export type ClientDiscoveryResult = {
  clientId: string;
  contactDomainsChecked: number;
  suppressedDomainCount: number;
  links: DiscoveredLink[];
  plans: ProposalPlan[];
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
}): Promise<ClientDiscoveryResult> {
  const [suppressedRows, contactRows, existingRows] = await Promise.all([
    prisma.suppressedDomain.findMany({
      where: { clientId: input.clientId },
      select: { domain: true },
    }),
    prisma.contact.findMany({
      where: { clientId: input.clientId, emailDomain: { not: null } },
      select: { emailDomain: true },
      distinct: ["emailDomain"],
    }),
    prisma.suppressedDomainFamilyProposal.findMany({
      where: { clientId: input.clientId },
      select: { seedDomain: true, proposedDomain: true, status: true },
    }),
  ]);

  const suppressedDomains = new Set(suppressedRows.map((r) => r.domain));
  const contactDomains = contactRows
    .map((r) => r.emailDomain)
    .filter((d): d is string => typeof d === "string" && d.length > 0);

  const links = await discoverLinksForClient({
    contactDomains,
    suppressedDomains,
    lookupTxt: input.lookupTxt,
  });

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
    plans: planFamilyProposals({ links, existing }),
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
}): Promise<{ created: number; refreshed: number; skipped: number }> {
  let created = 0;
  let refreshed = 0;
  let skipped = 0;

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
      await prisma.suppressedDomainFamilyProposal.create({
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
    } catch {
      // A concurrent run created it first. The unique constraint is the
      // authority; losing the race is not an error.
      skipped += 1;
    }
  }

  return { created, refreshed, skipped };
}
