import "server-only";

import { prisma } from "@/lib/db";
import { TRACKING_DNS_MAX_AGE_DAYS } from "@/lib/tracking/client-open-tracking";
import type { TrackingDnsSummary } from "@/lib/tracking/tracking-dns-checks";

import type { TrackedClientRow } from "./tracking-dns-verification";

/**
 * The database half of the tracking-DNS verifier.
 *
 * Kept apart from `tracking-dns-verification.ts` deliberately. That module holds
 * the LOOKING and the DECIDING, and both must be drivable from a test with no
 * database and no network — which they cannot be if importing them drags in a
 * Prisma client that throws on a missing DATABASE_URL. The sweep therefore takes
 * these functions as injected dependencies rather than importing them, which is
 * also what lets a test prove the auto-disable fires without touching a row.
 */

export type ClientTrackingDnsState = {
  /** The four results from the last check. Empty = nothing has ever looked. */
  checks: Array<{ label: string; pass: boolean; detail: string }>;
  /** All four passed AND recently enough that the dispatcher would agree. */
  verified: boolean;
  /** Pre-formatted here so server and client cannot disagree about a timezone. */
  checkedAtLabel: string | null;
  verifiedAtLabel: string | null;
};

/**
 * `trackingDnsReport` is a Json column, so it arrives as `unknown` and must be
 * PROVED rather than cast. A row of the wrong shape reads as "not checked yet",
 * which is both the honest answer and the safe one — never as a pass.
 */
function parseTrackingDnsReport(
  raw: unknown,
): Array<{ label: string; pass: boolean; detail: string }> {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const { label, pass, detail } = entry as Record<string, unknown>;
    if (typeof label !== "string" || typeof pass !== "boolean") return [];
    return [{ label, pass, detail: typeof detail === "string" ? detail : "" }];
  });
}

/** `YYYY-MM-DD HH:mm` — sliced, not localised, so there is no hydration drift. */
function formatCheckedAt(value: Date | null): string | null {
  if (!value) return null;
  const iso = value.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

/**
 * What the tracking card shows: the last check's four results, and whether they
 * still count.
 *
 * The freshness question is answered HERE rather than in the page because the
 * page is a React server component and reading the clock during render is
 * impure — but also because the screen must agree with the dispatcher. Both
 * decide freshness from `decideClientOpenTracking`'s own rule, so the card can
 * never show a green tick for a verification the send path would reject.
 */
export async function loadClientTrackingDnsState(
  clientId: string,
  now: Date = new Date(),
): Promise<ClientTrackingDnsState> {
  const row = await prisma.client.findFirst({
    where: { id: clientId, deletedAt: null },
    select: {
      trackingDnsCheckedAt: true,
      trackingDnsVerifiedAt: true,
      trackingDnsReport: true,
    },
  });
  const verifiedAt = row?.trackingDnsVerifiedAt ?? null;
  return {
    checks: parseTrackingDnsReport(row?.trackingDnsReport),
    verified:
      verifiedAt != null &&
      now.getTime() - verifiedAt.getTime() <
        TRACKING_DNS_MAX_AGE_DAYS * 24 * 60 * 60 * 1000,
    checkedAtLabel: formatCheckedAt(row?.trackingDnsCheckedAt ?? null),
    verifiedAtLabel: formatCheckedAt(verifiedAt),
  };
}

/** Every client with tracking switched on, with the mailboxes to check against. */
export async function loadTrackedClientsForDnsSweep(): Promise<TrackedClientRow[]> {
  const rows = await prisma.client.findMany({
    where: { deletedAt: null, openTrackingEnabledAt: { not: null } },
    select: {
      id: true,
      name: true,
      outreachLinkDomain: true,
      outreachLinkDomainVerifiedAt: true,
      openTrackingEnabledAt: true,
      trackingDnsVerifiedAt: true,
      mailboxIdentities: { select: { email: true, provider: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    outreachLinkDomain: r.outreachLinkDomain,
    outreachLinkDomainVerifiedAt: r.outreachLinkDomainVerifiedAt,
    openTrackingEnabledAt: r.openTrackingEnabledAt,
    trackingDnsVerifiedAt: r.trackingDnsVerifiedAt,
    mailboxes: r.mailboxIdentities.map((m) => ({ email: m.email, provider: m.provider })),
  }));
}

/** Write the result of one check. `verifiedAt` advances only on a full pass. */
export async function persistTrackingDnsCheck(input: {
  clientId: string;
  pass: boolean;
  verifiedAt: Date | null;
  checkedAt: Date;
  summary: TrackingDnsSummary;
}): Promise<void> {
  await prisma.client.update({
    where: { id: input.clientId },
    data: {
      trackingDnsCheckedAt: input.checkedAt,
      // On a FAIL this is cleared, not left standing. Leaving the old timestamp
      // would keep the send-time gate open until it aged out, and we already
      // know the DNS is wrong right now.
      trackingDnsVerifiedAt: input.pass ? input.verifiedAt : null,
      trackingDnsReport: input.summary.checks.map((c) => ({
        label: c.label,
        pass: c.pass,
        detail: c.detail,
      })),
    },
  });
}

/**
 * Switch a client's tracking OFF because their DNS regressed, and say so in the
 * audit log with the specific records that failed.
 *
 * `staffUserId` is null: this is the system acting, not a person, and recording
 * a staff id here would put a name against a decision nobody made. The pattern
 * for system-initiated audit rows follows `bounce-suppression.ts`.
 */
export async function disableTrackingForDnsRegression(input: {
  clientId: string;
  clientName: string;
  failedLabels: string[];
  summary: TrackingDnsSummary;
  at: Date;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.client.update({
      where: { id: input.clientId },
      data: {
        openTrackingEnabledAt: null,
        openTrackingEnabledByStaffUserId: null,
        trackingDnsVerifiedAt: null,
      },
    });
    await tx.auditLog.create({
      data: {
        staffUserId: null,
        clientId: input.clientId,
        action: "UPDATE",
        entityType: "Client.openTracking",
        entityId: input.clientId,
        metadata: {
          event: "open_tracking_disabled_dns_regression",
          enabled: false,
          failedChecks: input.failedLabels,
          detail: input.summary.checks
            .filter((c) => !c.pass)
            .map((c) => `${c.label}: ${c.detail}`),
          at: input.at.toISOString(),
        },
      },
    });
  });
}
