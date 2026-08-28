/**
 * The four DNS checks that gate open tracking, as PURE functions.
 *
 * Greg's rule, and it is the whole point of this file: **the system verifies the
 * DNS itself. It never trusts a tick-box.** A human confirming the records are in
 * place is exactly the human error this product exists to remove — and the cost
 * of getting it wrong is a client's sending domain in quarantine, which is what
 * happened in 2026 when a link pointed at a domain that did not match the sender.
 *
 * Resolution lives in `@/server/clients/tracking-dns-verification`; everything
 * here takes answers that have already been looked up and decides what they mean.
 * The split is not tidiness. It means every judgement in this file can be driven
 * red from a literal, so "what do we do about a `~all` SPF record" is settled by
 * a test rather than by whichever domain happened to be misconfigured that week.
 *
 * All four must pass. Three of four is not "mostly aligned" — it is an email that
 * gets quarantined for the one that failed.
 */

import { OUTREACH_LINK_APP_HOST } from "@/lib/clients/client-link-domain";

/**
 * Which platform actually sends for this domain. `BOTH` is real and not an edge
 * case: a client can have Microsoft and Google mailboxes on the same domain, and
 * then BOTH platforms must be authorised or half their mail fails authentication.
 */
export type TrackingDnsProvider = "MICROSOFT" | "GOOGLE" | "BOTH";

export type DnsCheckResult = {
  label: "SPF" | "DKIM" | "DMARC" | "Tracking host";
  pass: boolean;
  /** What was found and what is wanted. Shown to staff; never a secret. */
  detail: string;
};

/** SPF `include:` each platform requires. Mirrors `client-deliverability-help.tsx`. */
const SPF_INCLUDE: Record<"MICROSOFT" | "GOOGLE", string> = {
  MICROSOFT: "include:spf.protection.outlook.com",
  GOOGLE: "include:_spf.google.com",
};

/** Microsoft 365 publishes exactly these two DKIM selectors, as CNAMEs. */
const MICROSOFT_DKIM_SELECTORS = ["selector1._domainkey", "selector2._domainkey"] as const;
/** Google Workspace publishes ONE DKIM public key, as a TXT record. */
const GOOGLE_DKIM_SELECTOR = "google._domainkey";

function platformsFor(provider: TrackingDnsProvider): Array<"MICROSOFT" | "GOOGLE"> {
  if (provider === "BOTH") return ["MICROSOFT", "GOOGLE"];
  return [provider];
}

function normalise(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

// ---------------------------------------------------------------- SPF

export function checkSpf(input: {
  provider: TrackingDnsProvider;
  /** Every TXT record at the apex of the sending domain. */
  txt: readonly string[];
}): DnsCheckResult {
  const label = "SPF" as const;
  const spfRecords = input.txt.map(normalise).filter((t) => t.startsWith("v=spf1"));

  if (spfRecords.length === 0) {
    return {
      label,
      pass: false,
      detail:
        "No SPF record found on the sending domain. Receivers cannot tell which services are allowed to send as this domain.",
    };
  }
  if (spfRecords.length > 1) {
    // RFC 7208 §4.5: more than one SPF record is a permerror, and a permerror
    // is treated as no SPF at all. Two "correct" records are worse than one.
    return {
      label,
      pass: false,
      detail: `The domain publishes more than one SPF record (${String(spfRecords.length)}). Receivers treat that as an error and ignore SPF entirely — the records must be merged into one.`,
    };
  }

  const spf = spfRecords[0];

  // Ending `-all` is the requirement Greg named, and it is the one that matters:
  // `~all` (softfail) and `?all` (neutral) both tell receivers to accept mail
  // from senders the domain never authorised.
  if (!/(^|\s)-all\s*$/.test(spf)) {
    const found = /(^|\s)([-~?+]all)\s*$/.exec(spf)?.[2] ?? "no all mechanism";
    return {
      label,
      pass: false,
      detail: `SPF must end in -all so unauthorised senders are rejected outright. This record ends in "${found}", which still lets anyone send as this domain.`,
    };
  }

  const missing = platformsFor(input.provider).filter(
    (p) => !spf.includes(SPF_INCLUDE[p]),
  );
  if (missing.length > 0) {
    return {
      label,
      pass: false,
      detail: `SPF does not authorise the platform this domain actually sends through. It needs ${missing
        .map((p) => SPF_INCLUDE[p])
        .join(" and ")}.`,
    };
  }

  return { label, pass: true, detail: `SPF authorises the sending platform and ends in -all.` };
}

// --------------------------------------------------------------- DKIM

export function checkDkim(input: {
  provider: TrackingDnsProvider;
  /** CNAME targets by selector host, e.g. `selector1._domainkey`. */
  dkim: Readonly<Record<string, readonly string[]>>;
  /** TXT records by selector host, e.g. `google._domainkey`. */
  dkimTxt: Readonly<Record<string, readonly string[]>>;
}): DnsCheckResult {
  const label = "DKIM" as const;
  const problems: string[] = [];

  for (const platform of platformsFor(input.provider)) {
    if (platform === "MICROSOFT") {
      // Microsoft rotates between the two selectors, so a domain with only
      // selector1 published signs correctly today and stops without warning.
      const absent = MICROSOFT_DKIM_SELECTORS.filter(
        (s) => (input.dkim[s]?.length ?? 0) === 0,
      );
      if (absent.length > 0) {
        problems.push(
          `Microsoft DKIM is not published: ${absent.join(" and ")} does not resolve. Both selector CNAMEs are required — Microsoft rotates between them.`,
        );
      }
      continue;
    }

    // Google publishes a TXT public key rather than a CNAME. Looking for a CNAME
    // here would report every correctly-configured Google domain as broken.
    const txt = input.dkimTxt[GOOGLE_DKIM_SELECTOR] ?? [];
    const key = txt.map(normalise).find((t) => t.includes("v=dkim1"));
    if (!key) {
      problems.push(
        `Google DKIM is not published: no key found at ${GOOGLE_DKIM_SELECTOR}. Turn on DKIM signing in the Google admin console and publish the TXT record it generates.`,
      );
      continue;
    }
    // `p=` with nothing after it is how a key is REVOKED. The record exists, so
    // a presence-only check would pass it while no mail is being signed.
    if (/(^|;)\s*p=\s*(;|$)/.test(key)) {
      problems.push(
        `Google DKIM key at ${GOOGLE_DKIM_SELECTOR} has no public key (p= is empty), which means the key has been revoked and nothing is being signed.`,
      );
    }
  }

  if (problems.length > 0) return { label, pass: false, detail: problems.join(" ") };
  return { label, pass: true, detail: "DKIM signing is published for every platform this domain sends through." };
}

// -------------------------------------------------------------- DMARC

export function checkDmarc(input: {
  /** TXT records at `_dmarc.<domain>`. */
  dmarcTxt: readonly string[];
}): DnsCheckResult {
  const label = "DMARC" as const;
  const records = input.dmarcTxt.map(normalise).filter((t) => t.startsWith("v=dmarc1"));

  if (records.length === 0) {
    return {
      label,
      pass: false,
      detail:
        "No DMARC record found at _dmarc on the sending domain. Publish v=DMARC1; p=none; rua=mailto:… to start in monitor-only mode.",
    };
  }
  if (records.length > 1) {
    return {
      label,
      pass: false,
      detail: `The domain publishes more than one DMARC record (${String(records.length)}). Receivers treat that as none at all — exactly one is required.`,
    };
  }
  // A record with no `p=` tag is syntactically a DMARC record that instructs
  // receivers to do nothing, so presence alone is not the check.
  if (!/(^|;)\s*p\s*=\s*(none|quarantine|reject)\b/.test(records[0])) {
    return {
      label,
      pass: false,
      detail:
        "The DMARC record has no policy: it needs a p= tag (p=none is enough to start, and can be raised later).",
    };
  }
  return { label, pass: true, detail: "DMARC is published with a policy at _dmarc." };
}

// ----------------------------------------------------- Tracking host

export function checkTrackingHost(input: {
  /** The `go.<domain>` host tracking links would be minted on. */
  trackingHost: string | null;
  /** The domain the mail is sent FROM. The two must align. */
  sendingDomain: string;
  cname: readonly string[];
  /** Whether https://<host>/api/health returned THIS app over valid TLS. */
  servesOurApp: boolean;
}): DnsCheckResult {
  const label = "Tracking host" as const;
  const host = input.trackingHost?.trim().toLowerCase() ?? "";
  const sending = input.sendingDomain.trim().toLowerCase();

  if (!host) {
    return {
      label,
      pass: false,
      detail: `No tracking host is set for this customer. Tracking links must be served from a subdomain of ${sending} that they own.`,
    };
  }

  // THE 2026 QUARANTINE, AS ONE CONDITION. The link domain must be a subdomain
  // of the From: domain. A host that resolves to us but belongs to somebody else
  // is precisely the cross-domain signal that got this client's mail junked —
  // and would leak one customer's tracking into another's account.
  if (host !== sending && !host.endsWith(`.${sending}`)) {
    return {
      label,
      pass: false,
      detail: `${host} is not a subdomain of ${sending}. A tracking link must sit on the same domain the email is sent from, or the message reads as phishing.`,
    };
  }

  const targets = input.cname.map((t) => t.trim().toLowerCase().replace(/\.$/, ""));
  const pointsAtUs = targets.some(
    (t) => t === OUTREACH_LINK_APP_HOST || t.endsWith(".azurewebsites.net"),
  );
  if (!pointsAtUs) {
    return {
      label,
      pass: false,
      detail: `${host} does not point to us yet. Add a CNAME from ${host} to ${OUTREACH_LINK_APP_HOST}${
        targets.length ? ` (it currently resolves to ${targets.join(", ")})` : " (no CNAME record found)"
      }.`,
    };
  }

  // DNS resolving is not the same as the certificate being bound. A tracking
  // link that throws a certificate warning is worse than no tracking at all.
  if (!input.servesOurApp) {
    return {
      label,
      pass: false,
      detail: `${host} points to us but is not serving securely yet — the custom domain and its certificate still need to finish binding.`,
    };
  }

  return {
    label,
    pass: true,
    detail: `${host} is on the customer's own domain and is serving our app over a valid certificate.`,
  };
}

// ------------------------------------------------------------ Summary

export type TrackingDnsAnswers = {
  provider: TrackingDnsProvider;
  sendingDomain: string;
  trackingHost: string | null;
  txt: readonly string[];
  dmarcTxt: readonly string[];
  dkim: Readonly<Record<string, readonly string[]>>;
  dkimTxt: Readonly<Record<string, readonly string[]>>;
  cname: readonly string[];
  servesOurApp: boolean;
};

export type TrackingDnsSummary = {
  /** True only when every one of the four checks passed. */
  pass: boolean;
  /** Always four, always in the same order, so the screen never reshuffles. */
  checks: DnsCheckResult[];
  failedLabels: string[];
};

/**
 * Run all four checks over one sending domain.
 *
 * Every check runs even after one has failed. A gate that short-circuited would
 * be marginally faster and would send the customer's IT department round the
 * loop four times instead of once.
 */
export function summariseTrackingDnsChecks(
  answers: TrackingDnsAnswers,
): TrackingDnsSummary {
  const checks: DnsCheckResult[] = [
    checkSpf({ provider: answers.provider, txt: answers.txt }),
    checkDkim({
      provider: answers.provider,
      dkim: answers.dkim,
      dkimTxt: answers.dkimTxt,
    }),
    checkDmarc({ dmarcTxt: answers.dmarcTxt }),
    checkTrackingHost({
      trackingHost: answers.trackingHost,
      sendingDomain: answers.sendingDomain,
      cname: answers.cname,
      servesOurApp: answers.servesOurApp,
    }),
  ];
  const failedLabels = checks.filter((c) => !c.pass).map((c) => c.label);
  return { pass: failedLabels.length === 0, checks, failedLabels };
}

/** The DNS hosts a full check needs to resolve for one sending domain. */
export function trackingDnsLookupPlan(sendingDomain: string, provider: TrackingDnsProvider) {
  const domain = sendingDomain.trim().toLowerCase();
  const platforms = platformsFor(provider);
  return {
    domain,
    txtHost: domain,
    dmarcHost: `_dmarc.${domain}`,
    cnameSelectors: platforms.includes("MICROSOFT")
      ? MICROSOFT_DKIM_SELECTORS.map((s) => s)
      : [],
    txtSelectors: platforms.includes("GOOGLE") ? [GOOGLE_DKIM_SELECTOR] : [],
  };
}
