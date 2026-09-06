import "server-only";

import { promises as dns } from "node:dns";
import { isGoDomainAllowedForClient } from "@/lib/clients/client-link-domain";

import {
  summariseTrackingDnsChecks,
  trackingDnsLookupPlan,
  type TrackingDnsAnswers,
  type TrackingDnsProvider,
  type TrackingDnsSummary,
} from "@/lib/tracking/tracking-dns-checks";
import type { MailboxProvider } from "@/generated/prisma/client";

/**
 * Resolve a client's real DNS and decide whether their outreach may carry an
 * open-tracking pixel.
 *
 * Greg's rule, and the reason this file exists rather than a checkbox column:
 * **the system verifies the DNS itself, and never trusts a tick-box.** A human
 * confirming SPF is in place is exactly the human error this product exists to
 * remove, and the price of the error is a customer's sending domain in
 * quarantine — which is what happened in 2026.
 *
 * Two halves, split deliberately:
 *   * `buildTrackingDnsAnswers` does the LOOKING. Injected resolver, so failure
 *     modes are testable without anyone's live records.
 *   * `summariseTrackingDnsChecks` (in @/lib/tracking) does the JUDGING, purely.
 *
 * Everything here FAILS CLOSED. A timeout, an NXDOMAIN, an unreachable
 * nameserver and a genuinely misconfigured domain all produce the same outcome:
 * not verified. There is no branch where "we could not tell" means "yes".
 */

const PROBE_TIMEOUT_MS = 8000;
const APP_HEALTH_SERVICE = "opensdoors-outreach";
const HEALTH_PATH = "/api/health";

export type TrackingDnsResolver = {
  /** TXT records; node:dns returns each as an array of 255-byte chunks. */
  resolveTxt: (host: string) => Promise<string[][]>;
  resolveCname: (host: string) => Promise<string[]>;
  /** Whether `https://<host>/api/health` returns THIS app over valid TLS. */
  probeServesOurApp: (host: string) => Promise<boolean>;
};

export type ClientMailboxForDns = { email: string; provider: MailboxProvider };

export type TrackedClientRow = {
  id: string;
  name: string;
  outreachLinkDomain: string | null;
  outreachLinkDomainVerifiedAt: Date | null;
  openTrackingEnabledAt: Date | null;
  trackingDnsVerifiedAt: Date | null;
  mailboxes: ClientMailboxForDns[];
};

// ------------------------------------------------------------- resolver

/**
 * The live resolver. Every lookup swallows its error into "no records" on
 * purpose: an absent SPF record and a failed SPF lookup mean the same thing to
 * this gate — we cannot prove the domain is authenticated — and a thrown error
 * would abort a sweep midway and leave later clients unchecked.
 */
export const liveTrackingDnsResolver: TrackingDnsResolver = {
  resolveTxt: async (host) => {
    try {
      return await dns.resolveTxt(host);
    } catch {
      return [];
    }
  },
  resolveCname: async (host) => {
    try {
      return await dns.resolveCname(host);
    } catch {
      return [];
    }
  },
  probeServesOurApp: async (host) => {
    try {
      const res = await fetch(`https://${host}${HEALTH_PATH}`, {
        method: "GET",
        redirect: "manual",
        cache: "no-store",
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        headers: { "user-agent": "opensdoors-tracking-dns-verify" },
      });
      if (res.status !== 200) return false;
      const body: unknown = await res.json().catch(() => null);
      return (
        !!body &&
        typeof body === "object" &&
        (body as { ok?: unknown }).ok === true &&
        (body as { service?: unknown }).service === APP_HEALTH_SERVICE
      );
    } catch {
      return false;
    }
  },
};

/**
 * Which platform actually sends for this client.
 *
 * Returns null when there are no mailboxes to read it from — a REFUSAL, not a
 * default. Guessing here would decide which SPF `include:` to demand, and the
 * wrong guess passes a domain whose mail cannot authenticate.
 */
export function resolveClientTrackingDnsProvider(
  mailboxes: readonly ClientMailboxForDns[],
): TrackingDnsProvider | null {
  const hasMicrosoft = mailboxes.some((m) => m.provider === "MICROSOFT");
  const hasGoogle = mailboxes.some((m) => m.provider === "GOOGLE");
  if (hasMicrosoft && hasGoogle) return "BOTH";
  if (hasMicrosoft) return "MICROSOFT";
  if (hasGoogle) return "GOOGLE";
  return null;
}

/** Join the 255-byte chunks node:dns returns back into whole records. */
function flattenTxt(chunks: string[][]): string[] {
  return chunks.map((parts) => parts.join(""));
}

export async function buildTrackingDnsAnswers(
  target: {
    sendingDomain: string;
    trackingHost: string | null;
    provider: TrackingDnsProvider;
  },
  resolver: TrackingDnsResolver,
): Promise<TrackingDnsAnswers> {
  const plan = trackingDnsLookupPlan(target.sendingDomain, target.provider);

  const [txtChunks, dmarcChunks] = await Promise.all([
    resolver.resolveTxt(plan.txtHost).catch(() => []),
    resolver.resolveTxt(plan.dmarcHost).catch(() => []),
  ]);

  const dkim: Record<string, string[]> = {};
  for (const selector of plan.cnameSelectors) {
    dkim[selector] = await resolver
      .resolveCname(`${selector}.${plan.domain}`)
      .catch(() => []);
  }

  const dkimTxt: Record<string, string[]> = {};
  for (const selector of plan.txtSelectors) {
    dkimTxt[selector] = flattenTxt(
      await resolver.resolveTxt(`${selector}.${plan.domain}`).catch(() => []),
    );
  }

  // No host means nothing to probe. Skipping the request is not an optimisation
  // — firing an HTTPS request at "https://null/..." would be a bug looking for
  // somewhere to happen.
  const host = target.trackingHost?.trim().toLowerCase() || null;
  const cname = host ? await resolver.resolveCname(host).catch(() => []) : [];
  const servesOurApp = host
    ? await resolver.probeServesOurApp(host).catch(() => false)
    : false;

  return {
    provider: target.provider,
    sendingDomain: plan.domain,
    trackingHost: host,
    txt: flattenTxt(txtChunks),
    dmarcTxt: flattenTxt(dmarcChunks),
    dkim,
    dkimTxt,
    cname,
    servesOurApp,
  };
}

/** The sending domain a client's tracking host must align with. */
export function resolveClientSendingDomain(
  mailboxes: readonly ClientMailboxForDns[],
): string | null {
  for (const m of mailboxes) {
    const domain = m.email.split("@").pop()?.trim().toLowerCase();
    if (domain?.includes(".")) return domain;
  }
  return null;
}

/**
 * Resolve and judge one client's DNS. Never throws: a client whose lookups blow
 * up comes back as a FAILING summary with the reason on it, because a sweep that
 * stopped on the first unreachable nameserver would leave every later client
 * unchecked while still reporting success.
 */
export async function verifyClientTrackingDns(
  client: TrackedClientRow,
  resolver: TrackingDnsResolver,
): Promise<TrackingDnsSummary> {
  const alignedMailboxes = client.mailboxes.filter((mailbox) =>
    isGoDomainAllowedForClient(client.outreachLinkDomain ?? "", [mailbox.email]),
  );
  const provider = resolveClientTrackingDnsProvider(alignedMailboxes);
  const sendingDomain = resolveClientSendingDomain(alignedMailboxes);
  if (!provider || !sendingDomain) {
    return {
      pass: false,
      checks: [],
      failedLabels: ["SPF", "DKIM", "DMARC", "Tracking host"],
    };
  }
  try {
    const answers = await buildTrackingDnsAnswers(
      { sendingDomain, trackingHost: client.outreachLinkDomain, provider },
      resolver,
    );
    return summariseTrackingDnsChecks(answers);
  } catch {
    return {
      pass: false,
      checks: [],
      failedLabels: ["SPF", "DKIM", "DMARC", "Tracking host"],
    };
  }
}

// ---------------------------------------------------------------- sweep

export type TrackingDnsSweepResult = {
  checked: number;
  /** Client ids whose tracking this run switched OFF. */
  disabled: string[];
};

export type SweepDeps = {
  clients: readonly TrackedClientRow[];
  resolver: TrackingDnsResolver;
  now: Date;
  disableTracking: (input: {
    clientId: string;
    clientName: string;
    failedLabels: string[];
    summary: TrackingDnsSummary;
    at: Date;
  }) => Promise<void> | void;
  recordCheck: (input: {
    clientId: string;
    pass: boolean;
    /** Set only on a pass; this is what the send-time freshness gate reads. */
    verifiedAt: Date | null;
    checkedAt: Date;
    summary: TrackingDnsSummary;
  }) => Promise<void> | void;
};

/**
 * Re-check every client that has tracking ON, and switch OFF the ones that no
 * longer pass.
 *
 * This is the "re-check on a schedule and DISABLE AUTOMATICALLY if it regresses"
 * half of row 41. It is not, however, the only thing keeping a regressed client
 * safe: `decideClientOpenTracking` expires a verification older than
 * TRACKING_DNS_MAX_AGE_DAYS on its own, so if this sweep ever stops running,
 * tracking closes within the week rather than staying on for ever. That
 * belt-and-braces is deliberate — this repository has six recorded cases of
 * something wired, reporting success, and never firing.
 *
 * Clients that are not opted in are skipped entirely. There is nothing to
 * regress from, and writing a check result for them would make the sweep look
 * busier than it is.
 */
export async function sweepTrackingDnsRegressions(
  deps: SweepDeps,
): Promise<TrackingDnsSweepResult> {
  const disabled: string[] = [];
  let checked = 0;

  for (const client of deps.clients) {
    if (client.openTrackingEnabledAt == null) continue;
    checked += 1;

    const summary = await verifyClientTrackingDns(client, deps.resolver);

    await deps.recordCheck({
      clientId: client.id,
      pass: summary.pass,
      verifiedAt: summary.pass ? deps.now : null,
      checkedAt: deps.now,
      summary,
    });

    if (!summary.pass) {
      // One client at a time, by id, from this iteration's own row. The sweep is
      // exactly where a cross-client leak would happen — one shared loop, one
      // mistaken variable, and B is switched off because A's SPF broke.
      await deps.disableTracking({
        clientId: client.id,
        clientName: client.name,
        failedLabels: summary.failedLabels,
        summary,
        at: deps.now,
      });
      disabled.push(client.id);
    }
  }

  return { checked, disabled };
}
