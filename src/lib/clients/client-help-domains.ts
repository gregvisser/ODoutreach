/**
 * Which domain(s) the customer-facing setup help should be written about.
 *
 * The Microsoft admin-consent panel and the SPF/DKIM/DMARC panel are both
 * "here is what to send the customer's IT department". Until 2026-08-28 both
 * were derived purely from CONNECTED MAILBOXES, which meant a client with no
 * mailbox connected saw neither — the exact moment staff need them, because
 * those instructions are how the mailbox gets connected in the first place.
 *
 * So the domain resolves down a chain:
 *   1. connected mailboxes — ground truth, and they also tell us HOW the
 *      domain sends (Microsoft 365 / Google Workspace / both);
 *   2. the client's own website;
 *   3. the recorded default sender address.
 *
 * Below the mailboxes we do not know the provider, so we say MIXED and show
 * both paths rather than guessing one and handing an IT department steps for
 * a platform they do not use. When nothing yields a domain we report UNKNOWN
 * so the screen can ask for it, instead of silently rendering nothing.
 */

/** How a sending domain's mailbox(es) send. */
export type MailboxProvider = "MICROSOFT" | "GOOGLE" | "MIXED";

export type ClientDeliverabilityEntry = {
  /** The customer's sending domain, e.g. "paratus365.com". */
  domain: string;
  /** How this domain's connected mailbox(es) send. */
  provider: MailboxProvider;
};

/** Where the domain(s) came from — drives the caveat the screen shows. */
export type ClientHelpDomainSource = "MAILBOXES" | "CLIENT_RECORD" | "UNKNOWN";

export type ClientHelpDomains = {
  source: ClientHelpDomainSource;
  deliverability: ClientDeliverabilityEntry[];
  /** Domains worth handing a Microsoft tenant admin-consent link for. */
  microsoftDomains: string[];
};

export type ClientHelpDomainsInput = {
  mailboxes: readonly { email: string; provider: string }[];
  website: string | null;
  defaultSenderEmail: string | null;
};

/** A domain must have a dot and no whitespace to be worth showing to an IT dept. */
function normaliseDomain(raw: string | null | undefined): string | null {
  const value = raw?.trim().toLowerCase() ?? "";
  if (value.length === 0) return null;
  const withoutWww = value.startsWith("www.") ? value.slice(4) : value;
  if (!withoutWww.includes(".")) return null;
  if (/\s/.test(withoutWww)) return null;
  return withoutWww;
}

/** "https://www.acme.co.uk/about?x=1" → "acme.co.uk". Null when unusable. */
export function domainFromWebsite(website: string | null | undefined): string | null {
  const raw = website?.trim() ?? "";
  if (raw.length === 0) return null;
  const withoutScheme = raw.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
  const hostAndPort = withoutScheme.split(/[/?#]/)[0] ?? "";
  const host = hostAndPort.split(":")[0] ?? "";
  return normaliseDomain(host);
}

/** "Hello@Acme.COM" → "acme.com". Null when it is not an address. */
function domainFromEmail(email: string | null | undefined): string | null {
  const raw = email?.trim().toLowerCase() ?? "";
  if (!raw.includes("@")) return null;
  return normaliseDomain(raw.split("@")[1]);
}

export function resolveClientHelpDomains(
  input: ClientHelpDomainsInput,
): ClientHelpDomains {
  // 1 — connected mailboxes. Insertion order is kept so the screen lists the
  // domains in the order the mailboxes were connected.
  const providerByDomain = new Map<string, MailboxProvider>();
  const microsoftDomains = new Set<string>();
  for (const mailbox of input.mailboxes) {
    const domain = domainFromEmail(mailbox.email);
    if (!domain) continue;
    const provider: MailboxProvider =
      mailbox.provider === "GOOGLE" ? "GOOGLE" : "MICROSOFT";
    if (provider === "MICROSOFT") microsoftDomains.add(domain);
    const previous = providerByDomain.get(domain);
    providerByDomain.set(
      domain,
      !previous || previous === provider ? provider : "MIXED",
    );
  }

  if (providerByDomain.size > 0) {
    return {
      source: "MAILBOXES",
      deliverability: Array.from(providerByDomain.entries()).map(
        ([domain, provider]) => ({ domain, provider }),
      ),
      microsoftDomains: Array.from(microsoftDomains),
    };
  }

  // 2/3 — nothing connected yet. Fall back to what the client record knows.
  const fallback =
    domainFromWebsite(input.website) ?? domainFromEmail(input.defaultSenderEmail);

  if (!fallback) {
    return { source: "UNKNOWN", deliverability: [], microsoftDomains: [] };
  }

  return {
    source: "CLIENT_RECORD",
    // Provider unknown before a mailbox connects — show both paths.
    deliverability: [{ domain: fallback, provider: "MIXED" }],
    microsoftDomains: [fallback],
  };
}
