/**
 * Discovering that two domains belong to the same company — by LOOKUP, never by
 * inference.
 *
 * RULING 3 (Greg, 2026-08-24) forbids inferring family membership, because
 * `bteurope.com` shares no text with `bt.com` and any algorithm connecting them
 * by NAME would also connect things that are not related. That reasoning stands
 * and nothing here connects domains by name: no stem matching, no substring, no
 * edit distance.
 *
 * What it does instead is read records the company itself published about its
 * own domains, and then **ask a person**. Nothing in this module writes to
 * `SuppressedDomainFamily`, and nothing it produces is read by the send gate. It
 * raises proposals; a human confirms them.
 *
 * ## What was measured before this was written (2026-08-24, production)
 *
 * * **Certificate Transparency is not here, deliberately.** One GlobalSign OV
 *   certificate merged a client with eight unrelated train operators, and all
 *   three proposed guards passed it. crt.sh 502s and its JSON cannot enumerate a
 *   certificate's full name list anyway.
 * * **SPF `include:` is not here, deliberately.** RFC 7208 §5.2 defines it as
 *   the mechanism for *crossing* an administrative boundary; §6.1 designates
 *   `redirect=` for the same-authority case. Measured, `include:` linked 216
 *   contact domains to `outlook.com`, which is itself on a do-not-contact list.
 * * **Resolution runs from the CONTACT side.** There are 15,714 suppressed
 *   domains and 966 contact domains; walking the suppression list would be 16×
 *   the work and could only ever surface links that change no outcome.
 */
import { parse } from "tldts";

export type FamilyProposalSourceName = "DMARC_RUA" | "SPF_REDIRECT";

export type DiscoveredLink = {
  /** The suppressed domain the link points AT — already on the client's list. */
  seedDomain: string;
  /** The domain we believe belongs with it — the contact domain we started from. */
  proposedDomain: string;
  source: FamilyProposalSourceName;
  /** The record text exactly as read, so a person can see the evidence. */
  evidence: string;
};

export type ExistingProposal = {
  seedDomain: string;
  proposedDomain: string;
  status: "PENDING" | "CONFIRMED" | "REJECTED";
};

export type ProposalPlan =
  | { kind: "create"; link: DiscoveredLink; fanIn: number }
  | { kind: "refresh"; link: DiscoveredLink; fanIn: number }
  | {
      kind: "skip";
      link: DiscoveredLink;
      reason:
        | "rejected_tombstone"
        | "already_confirmed"
        | "fan_in_cap"
        | "consumer_mailbox_host";
    };

/**
 * Above this many distinct companies pointing at one seed, the seed is a vendor
 * and no proposal is raised.
 *
 * Measured: `outlook.com` 216, `google.com` 11, `salesforce.com` 9 — against
 * every genuine corporate relative at 1–2.
 *
 * This is NOT the safety mechanism. The operator's click is. `nhs.net` had
 * fan-in 2 in the same dataset and is still a shared service, which is why the
 * number is stored and shown rather than only used to filter.
 */
export const FAN_IN_CAP = 3;

/**
 * Mailbox providers whose domain belongs to individuals, not to a company.
 *
 * FOUND BY MEASURING, 2026-08-24. The first read-only run over production
 * proposed `gmail.com belongs with google.com`, read from gmail.com's own DMARC
 * record. **That link is true** — Gmail is Google — and confirming it would have
 * suppressed every personal Gmail address for a client who had google.com on
 * their list. Fan-in was 1, so the cap could not catch it: the cap finds a
 * domain that many companies point at, and gmail.com points at exactly one.
 *
 * Truth is not the test here; usefulness is. `btinternet.com` is BT's consumer
 * service and is on this list for the same reason, even though `btinternet.com`
 * genuinely is BT.
 *
 * Matched by registrable domain, so a subdomain is covered too.
 */
const CONSUMER_MAILBOX_HOSTS = new Set([
  "gmail.com", "googlemail.com",
  "outlook.com", "hotmail.com", "hotmail.co.uk", "live.com", "live.co.uk", "msn.com",
  "yahoo.com", "yahoo.co.uk", "ymail.com", "rocketmail.com",
  "aol.com", "aol.co.uk",
  "icloud.com", "me.com", "mac.com",
  "gmx.com", "gmx.co.uk", "gmx.net",
  "proton.me", "protonmail.com", "pm.me",
  "mail.com", "zoho.com", "yandex.com", "yandex.ru",
  "fastmail.com", "tutanota.com", "hushmail.com",
  // UK consumer ISPs — a personal address, not a corporate identity.
  "btinternet.com", "sky.com", "virginmedia.com", "talktalk.net", "blueyonder.co.uk",
  "ntlworld.com", "tiscali.co.uk", "plus.net", "plusnet.com", "orange.net",
  "btopenworld.com", "waitrose.com",
]);

/** True when the domain is a mailbox provider rather than a company identity. */
export function isConsumerMailboxHost(domain: string): boolean {
  const reg = registrable(domain);
  return reg !== null && CONSUMER_MAILBOX_HOSTS.has(reg);
}

/** Registrable domain (eTLD+1), or null when it cannot be resolved. */
function registrable(hostOrEmail: string | null | undefined): string | null {
  const raw = hostOrEmail?.trim().toLowerCase();
  if (!raw) return null;
  const host = raw.includes("@") ? (raw.split("@").pop() ?? "") : raw;
  if (!host) return null;
  return parse(host.replace(/^www\./, ""), { allowPrivateDomains: true }).domain ?? null;
}

/**
 * Links declared by a domain's own DMARC record.
 *
 * Only the domain's OWN `_dmarc` record is ever read — no organisational-domain
 * tree walk. RFC 9989/9990 define that fallback for policy discovery, but using
 * it here would make every subdomain inherit its parent's `rua` and manufacture
 * relationships that nobody published.
 *
 * External-domain verification (RFC 9990 §4) is deliberately NOT required as
 * proof: a `*._report._dmarc` wildcard is blanket consent to the whole internet,
 * verified live against `google.com` and `shell.com`, so its presence says
 * nothing about a relationship between two specific domains.
 *
 * `records` must already have had TXT chunks joined — a record over 255 bytes
 * arrives split, and regexing the parts separately silently misses long ones.
 */
export function parseDmarcRuaLinks(
  domain: string,
  records: readonly string[],
): DiscoveredLink[] {
  const self = registrable(domain);
  if (!self) return [];
  const out: DiscoveredLink[] = [];
  const seen = new Set<string>();

  for (const raw of records) {
    const record = raw.trim();
    // RFC 9990 §4: the v tag is mandatory and MUST appear first.
    if (!/^v\s*=\s*DMARC1\b/i.test(record)) continue;
    const rua = record.match(/(?:^|;)\s*rua\s*=\s*([^;]+)/i)?.[1];
    if (!rua) continue;

    for (const entry of rua.split(",")) {
      // Strip the optional size limit: mailto:x@y.com!10m
      const uri = entry.trim().replace(/!.*$/, "");
      if (!/^mailto:/i.test(uri)) continue;
      const address = uri.slice("mailto:".length).trim();
      const target = registrable(address);
      if (!target || target === self) continue;
      const key = `${target}|${self}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        seedDomain: target,
        proposedDomain: domain.toLowerCase(),
        source: "DMARC_RUA",
        evidence: record,
      });
    }
  }
  return out;
}

/**
 * A link declared by a domain's own SPF `redirect=`.
 *
 * `include:` is not read. RFC 7208 §5.2 assigns it to *crossing* an
 * administrative boundary — it is a permission grant to a counterparty, which is
 * precisely a vendor relationship. §6.1 assigns `redirect=` to consolidating
 * policy within one administrative domain, which is the ownership case.
 */
export function parseSpfRedirectLink(
  domain: string,
  records: readonly string[],
): DiscoveredLink | null {
  const self = registrable(domain);
  if (!self) return null;

  for (const raw of records) {
    const record = raw.trim();
    if (!/^v=spf1\b/i.test(record)) continue;
    // RFC 7208 §6.1: redirect is ignored entirely when an `all` mechanism is
    // present, because `all` always matches first.
    if (/(?:^|\s)[+\-~?]?all(?:\s|$)/i.test(record)) continue;
    const target = record.match(/(?:^|\s)redirect=([^\s]+)/i)?.[1];
    if (!target) continue;
    const reg = registrable(target);
    if (!reg || reg === self) continue;
    return {
      seedDomain: reg,
      proposedDomain: domain.toLowerCase(),
      source: "SPF_REDIRECT",
      evidence: record,
    };
  }
  return null;
}

/**
 * Decide what to do with a run's worth of discovered links. Pure.
 *
 * The rules, in order:
 *
 *   1. A `REJECTED` pair is never raised again, whatever the evidence and
 *      whichever source found it. **This is the tombstone**, and it is the whole
 *      reason the proposal store exists: without it a re-run reads the same DNS
 *      and silently reinstates what a person refused.
 *   2. A `CONFIRMED` pair is already a family row; nothing to ask.
 *   3. A seed that too many distinct companies point at is a vendor.
 *   4. Otherwise create, or refresh an existing pending question so its evidence
 *      and fan-in stay current.
 */
export function planFamilyProposals(input: {
  links: readonly DiscoveredLink[];
  existing: readonly ExistingProposal[];
  fanInCap?: number;
}): ProposalPlan[] {
  const cap = input.fanInCap ?? FAN_IN_CAP;

  const statusByPair = new Map<string, ExistingProposal["status"]>();
  for (const e of input.existing) {
    statusByPair.set(pairKey(e.seedDomain, e.proposedDomain), e.status);
  }

  // Fan-in counts distinct COMPANIES per seed, not records. One company found by
  // both DMARC and SPF is one relationship; counting it twice would push a
  // genuine link over the cap.
  const companiesBySeed = new Map<string, Set<string>>();
  for (const l of input.links) {
    const set = companiesBySeed.get(l.seedDomain) ?? new Set<string>();
    set.add(l.proposedDomain);
    companiesBySeed.set(l.seedDomain, set);
  }

  const out: ProposalPlan[] = [];
  const emitted = new Set<string>();

  for (const link of input.links) {
    const key = pairKey(link.seedDomain, link.proposedDomain);
    const fanIn = companiesBySeed.get(link.seedDomain)?.size ?? 1;

    // A consumer mailbox provider is never a family member, whichever side it
    // sits on. Checked BEFORE the cap because the cap cannot see this: the
    // gmail.com case had fan-in 1.
    if (
      isConsumerMailboxHost(link.proposedDomain) ||
      isConsumerMailboxHost(link.seedDomain)
    ) {
      out.push({ kind: "skip", link, reason: "consumer_mailbox_host" });
      continue;
    }

    const status = statusByPair.get(key);
    if (status === "REJECTED") {
      out.push({ kind: "skip", link, reason: "rejected_tombstone" });
      continue;
    }
    if (status === "CONFIRMED") {
      out.push({ kind: "skip", link, reason: "already_confirmed" });
      continue;
    }
    if (fanIn >= cap) {
      out.push({ kind: "skip", link, reason: "fan_in_cap" });
      continue;
    }
    // One question per pair, even when two sources found it.
    if (emitted.has(key)) continue;
    emitted.add(key);
    out.push({ kind: status === "PENDING" ? "refresh" : "create", link, fanIn });
  }

  return out;
}

function pairKey(seedDomain: string, proposedDomain: string): string {
  return `${seedDomain.toLowerCase()}|${proposedDomain.toLowerCase()}`;
}
