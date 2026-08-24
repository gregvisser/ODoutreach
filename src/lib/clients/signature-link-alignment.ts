/**
 * Link alignment for outgoing email content.
 *
 * **This is Bidlow's own rule, earned from the 2026 quarantine — it is not an
 * external standard and must not be presented as one.** An email whose `From:`
 * is `@customerdomain.com` while its links point somewhere unrelated matches the
 * classic phishing shape, and secure email gateways score it heavily.
 *
 * The logic lived only in `scripts/ops-cross-domain-audit.ts`, which has no
 * production caller and, as written, could not gate anything: its `main()` only
 * console.logs, and its single `process.exitCode = 1` sits in the `.catch()`, so
 * a run finding fifty HIGH issues still exits 0. Same defect class as PR #194 —
 * detector written, caller never built. This module is the one implementation;
 * the script imports it.
 *
 * ## Registrable domains
 *
 * Uses `tldts`, which bundles the real Public Suffix List. The script's
 * hand-rolled 16-entry suffix array could not resolve anything outside those 16,
 * and a misresolved suffix produces a FALSE CLEAN — it makes a foreign host look
 * aligned — which is the dangerous direction to be wrong in.
 *
 * `tldts` was chosen over `psl` because it was ALREADY in the dependency tree
 * (via shadcn → msw → tough-cookie), so declaring it directly costs no install
 * size, and it ships its own TypeScript types where `psl` needs `@types/psl`. It
 * is declared as a direct dependency deliberately: relying on it transitively
 * through a scaffolding CLI would break silently the day someone correctly moves
 * `shadcn` to devDependencies.
 *
 * `allowPrivateDomains` is ON so two different projects on a shared platform
 * (`a.supabase.co` vs `b.supabase.co`) are not treated as the same origin.
 */
import { parse } from "tldts";

/** Hosts that are normal in a business signature and carry their own reputation. */
const WELL_KNOWN_HOSTS = new Set([
  "linkedin.com",
  "calendly.com",
  "youtube.com",
  "twitter.com",
  "x.com",
  "facebook.com",
  "instagram.com",
  "google.com",
  "microsoft.com",
  "office.com",
]);

export type LinkSeverity = "HIGH" | "MEDIUM" | "LOW";

export type ExtractedLink = {
  url: string;
  host: string;
  /** True only for a `src=` attribute — a resource the mail client loads on open. */
  isImage: boolean;
  /** Human label for where this came from, e.g. "signature HTML". */
  where: string;
};

export type LinkFinding = ExtractedLink & {
  severity: LinkSeverity;
  /** Plain-English reason, safe to show a non-technical operator. */
  reason: string;
};

/**
 * Registrable domain (eTLD+1) for a hostname or URL, or null when it cannot be
 * resolved. Returning null rather than guessing matters: a guess here becomes a
 * false clean.
 */
export function registrableDomainOf(hostOrUrl: string | null | undefined): string | null {
  const raw = hostOrUrl?.trim();
  if (!raw) return null;
  let host = raw;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    try {
      host = new URL(raw).hostname;
    } catch {
      return null;
    }
  }
  const parsed = parse(host.replace(/^www\./i, ""), { allowPrivateDomains: true });
  return parsed.domain ?? null;
}

/**
 * Every `http(s)` URL in HTML or plain text, noting which came from a `src=`.
 *
 * Deduped by URL within a source. The attribute pass runs first so a `src` is
 * classified as an image before the bare-URL pass sees the same string —
 * otherwise every logo is reported twice and the counts inflate.
 */
export function extractLinks(
  content: string | null | undefined,
  where: string,
): ExtractedLink[] {
  if (!content) return [];
  const out: ExtractedLink[] = [];
  const seen = new Set<string>();

  const push = (raw: string, isImage: boolean): void => {
    const url = raw.trim();
    if (!/^https?:\/\//i.test(url)) return;
    if (seen.has(url)) return;
    seen.add(url);
    try {
      out.push({ url, host: new URL(url).hostname, isImage, where });
    } catch {
      /* unparseable — ignore */
    }
  };

  const attrRe = /\b(src|href)\s*=\s*["']([^"']+)["']/gi;
  const bareRe = /https?:\/\/[^\s<>"')]+/gi;
  let m: RegExpExecArray | null;
  while ((m = attrRe.exec(content)) !== null) push(m[2], m[1].toLowerCase() === "src");
  while ((m = bareRe.exec(content)) !== null) push(m[0], false);
  return out;
}

export type AlignmentContext = {
  /** Registrable domains belonging to the CLIENT — mailbox domains, website, link domain. */
  ownDomains: ReadonlySet<string>;
  /** Registrable domains belonging to the OpensDoors platform itself. */
  appDomains: ReadonlySet<string>;
};

/** True when the URL sits on one of the client's own registrable domains. */
export function isAlignedWithOwnDomains(
  url: string,
  ownDomains: ReadonlySet<string>,
): boolean {
  const reg = registrableDomainOf(url);
  return reg !== null && ownDomains.has(reg);
}

/**
 * Severity for one extracted link.
 *
 * DELIBERATELY DIFFERENT from the original script, which returned HIGH for any
 * remote image on a foreign host. Measured against production on 2026-08-24 that
 * rule produced 11 HIGH findings, and every one of them was a company logo:
 * Train Hugger's own logo on `cdn.prod.website-files.com`, which is Webflow's
 * asset host for Train Hugger's own website. Blocking on that would have stopped
 * the largest client — 763 sends — for hosting its own logo in the normal way.
 *
 * The risk the quarantine actually taught is misalignment in the CLICK-THROUGH
 * path: an opt-out or tracking link on a domain unrelated to the sender. A logo
 * image is a different and much weaker signal, and mail clients block remote
 * images by default anyway. So:
 *
 *   HIGH   — the OpensDoors platform's own domain inside a customer's email.
 *            This is the exact quarantine pattern and the only thing that blocks.
 *   MEDIUM — any other foreign host, image or link. Worth an operator's
 *            attention, surfaced on Launch readiness, does not block.
 *   LOW    — well-known professional destinations.
 *
 * The original also tested `isImage` BEFORE the well-known list, so a LinkedIn
 * icon — an image on linkedin.com — scored HIGH. That ordering is corrected
 * here: well-known is checked first regardless of image-ness.
 */
/**
 * True when `host` is, or sits under, one of `domains`.
 *
 * Used for the PLATFORM's own domains, where registrable-domain equality is not
 * enough. `azurewebsites.net` is itself a public suffix, so with
 * `allowPrivateDomains` on, `app-opensdoors-outreach-prod.azurewebsites.net`
 * resolves to the whole host and would never equal `azurewebsites.net`. Suffix
 * matching catches every App Service hostname without weakening the client-side
 * comparison, which stays exact-registrable-domain.
 */
function hostMatchesAny(host: string, domains: ReadonlySet<string>): boolean {
  const h = host.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  for (const d of domains) {
    const dd = d.toLowerCase();
    if (h === dd || h.endsWith(`.${dd}`)) return true;
  }
  return false;
}

export function severityForLink(
  link: ExtractedLink,
  ctx: AlignmentContext,
): LinkSeverity | null {
  const reg = registrableDomainOf(link.url);
  // ALIGNMENT WINS, and is checked FIRST.
  //
  // An earlier revision put the platform check first as "belt and braces". That
  // was wrong, and the production run caught it: BidlowAI is itself a workspace,
  // its mailbox is `greg@bidlow.co.uk`, and the app runs at
  // `opensdoors.bidlow.co.uk`. Reducing the app URL to its registrable domain
  // swallowed the whole `bidlow.co.uk` zone, so BidlowAI's links to its OWN
  // marketing site scored HIGH and would have blocked its own sends. A link on
  // the sender's own registrable domain is aligned by definition — there is no
  // phishing signal to find — so nothing may override that.
  if (reg !== null && ctx.ownDomains.has(reg)) return null;
  // The platform check runs on the raw HOST, by suffix, so every App Service
  // hostname is caught without claiming a whole registrable zone.
  if (hostMatchesAny(link.host, ctx.appDomains)) return "HIGH";
  if (reg === null) return "MEDIUM";
  if (WELL_KNOWN_HOSTS.has(reg)) return "LOW";
  return "MEDIUM";
}

function reasonFor(link: ExtractedLink, severity: LinkSeverity): string {
  const host =
    severity === "HIGH"
      ? link.host.replace(/^www\./, "")
      : (registrableDomainOf(link.url) ?? link.host);
  if (severity === "HIGH") {
    return `This links to ${host}, which is the OpensDoors system's own address rather than the client's. Recipients see a link that does not match who the email is from, which is what gets mail quarantined.`;
  }
  if (severity === "LOW") {
    return `Links to ${host}, a well-known professional site. Normal in a signature.`;
  }
  return link.isImage
    ? `Loads an image from ${host}, which is not one of the client's own domains. Usually a logo and usually fine, but worth confirming it is deliberate.`
    : `Links to ${host}, which is not one of the client's own domains.`;
}

/** Classify every link in one piece of content. Aligned links produce no finding. */
export function findMisalignedLinks(
  content: string | null | undefined,
  where: string,
  ctx: AlignmentContext,
): LinkFinding[] {
  const out: LinkFinding[] = [];
  for (const link of extractLinks(content, where)) {
    const severity = severityForLink(link, ctx);
    if (severity === null) continue;
    out.push({ ...link, severity, reason: reasonFor(link, severity) });
  }
  return out;
}

/** Build the client's own registrable domains from its mailbox addresses and settings. */
export function ownDomainsFor(input: {
  mailboxEmails: readonly string[];
  website?: string | null;
  outreachLinkDomain?: string | null;
}): Set<string> {
  const out = new Set<string>();
  for (const email of input.mailboxEmails) {
    const at = email.split("@").pop();
    const reg = registrableDomainOf(at);
    if (reg) out.add(reg);
  }
  for (const raw of [input.website, input.outreachLinkDomain]) {
    const reg = registrableDomainOf(raw);
    if (reg) out.add(reg);
  }
  return out;
}

/**
 * Hostnames belonging to the OpensDoors platform itself.
 *
 * EXACT HOSTS, not registrable domains. The app runs at
 * `opensdoors.bidlow.co.uk`; reducing that to `bidlow.co.uk` would claim the
 * entire zone, including BidlowAI's own marketing site — which is a legitimate
 * client domain. Matching is by host-or-subdomain (see `hostMatchesAny`), so
 * `azurewebsites.net` still catches every App Service hostname.
 */
export function appDomainsFromEnv(): Set<string> {
  const out = new Set<string>(["azurewebsites.net"]);
  for (const raw of [
    process.env.AUTH_URL,
    process.env.INTERNAL_APP_URL,
    process.env.NEXT_PUBLIC_APP_URL,
  ]) {
    const v = raw?.trim();
    if (!v) continue;
    try {
      out.add(new URL(v).hostname.toLowerCase().replace(/^www\./, ""));
    } catch {
      /* ignore */
    }
  }
  return out;
}

/** True when a HIGH finding exists — the only severity that blocks a send. */
export function hasBlockingFinding(findings: readonly LinkFinding[]): boolean {
  return findings.some((f) => f.severity === "HIGH");
}

/**
 * Findings for one mailbox's stored signature — the surface the audit script
 * calls "the highest-risk", because it is sent verbatim and may reference any
 * host.
 *
 * `ownDomains` defaults to the mailbox's own sending domain. A client may pass a
 * wider set (website, verified link domain) when it has one.
 */
export function mailboxSignatureFindings(input: {
  email: string;
  senderSignatureHtml?: string | null;
  senderSignatureText?: string | null;
  ownDomains?: ReadonlySet<string>;
  appDomains?: ReadonlySet<string>;
}): LinkFinding[] {
  const ownDomains =
    input.ownDomains ?? ownDomainsFor({ mailboxEmails: [input.email] });
  const ctx: AlignmentContext = {
    ownDomains,
    appDomains: input.appDomains ?? appDomainsFromEnv(),
  };
  return [
    ...findMisalignedLinks(input.senderSignatureHtml, "signature HTML", ctx),
    ...findMisalignedLinks(input.senderSignatureText, "signature text", ctx),
  ];
}

export type SignatureLinkStatus = {
  /** `blocked` stops the send. `warning` is worth a look. `clean` is fine. */
  tone: "clean" | "warning" | "blocked";
  /**
   * One sentence, written for a non-technical operator. No codes, no severity
   * letters, no host lists longer than the reader can act on.
   */
  sentence: string;
  /** The specific reasons, already plain-English. Empty when clean. */
  details: string[];
};

/**
 * Turn findings into something a staff member can act on without help.
 *
 * The staff could not see any of this: the audit lived in a script nobody ran,
 * and the mailbox panel showed the rendered signature with no indication of
 * where its links went. This is the sentence that goes on screen.
 */
export function describeSignatureLinkStatus(
  findings: readonly LinkFinding[],
  sendingDomain: string,
): SignatureLinkStatus {
  const blocking = findings.filter((f) => f.severity === "HIGH");
  if (blocking.length > 0) {
    // The EXACT host, not the registrable domain. The operator has to find this
    // string in the signature and delete it, so `opensdoors.bidlow.co.uk` is
    // actionable where `bidlow.co.uk` is not.
    const hosts = [...new Set(blocking.map((f) => f.host.replace(/^www\./, "")))];
    return {
      tone: "blocked",
      sentence: `This signature links to ${formatHostList(hosts)} — sending is blocked until this is removed.`,
      details: [...new Set(blocking.map((f) => f.reason))],
    };
  }

  const warnings = findings.filter((f) => f.severity === "MEDIUM");
  if (warnings.length > 0) {
    const hosts = [...new Set(warnings.map((f) => registrableDomainOf(f.url) ?? f.host))];
    return {
      tone: "warning",
      sentence: `This signature loads content from ${formatHostList(hosts)}, which is not ${sendingDomain}. That is usually a logo and usually fine — check it is deliberate.`,
      details: [...new Set(warnings.map((f) => f.reason))],
    };
  }

  return {
    tone: "clean",
    sentence: `All links point to ${sendingDomain} — safe to send.`,
    details: [],
  };
}

function formatHostList(hosts: readonly string[]): string {
  if (hosts.length === 1) return hosts[0]!;
  if (hosts.length === 2) return `${hosts[0]} and ${hosts[1]}`;
  return `${hosts.slice(0, -1).join(", ")} and ${hosts[hosts.length - 1]}`;
}

/** Convenience: findings + sentence for one mailbox row, in one call. */
export function signatureLinkStatusFor(input: {
  email: string;
  senderSignatureHtml?: string | null;
  senderSignatureText?: string | null;
  ownDomains?: ReadonlySet<string>;
  appDomains?: ReadonlySet<string>;
}): SignatureLinkStatus {
  const sendingDomain =
    registrableDomainOf(input.email.split("@").pop()) ?? "this mailbox's domain";
  return describeSignatureLinkStatus(mailboxSignatureFindings(input), sendingDomain);
}
