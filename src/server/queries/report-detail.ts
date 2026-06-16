import "server-only";

import { prisma } from "@/lib/db";
import {
  REPORT_DETAIL_METRICS,
  type ReportDetailMetricKey,
} from "@/lib/reports/report-detail-metrics";
import { assertClientInAccessibleList } from "@/server/tenant/access";

import type { MetricsWindow } from "./outreach-metrics";

/**
 * F5 — the row-level drill-down behind each Reports metric.
 *
 * Every query here mirrors EXACTLY the matching `count()` in
 * `gatherRawCounts` (outreach-metrics.ts): same status sets, same windowed vs
 * state-metric behaviour, same cooldown exclusion. That correspondence is the
 * whole point — a drill-down must list precisely the rows that produced the
 * number it was opened from. If you change a count there, change its query here.
 *
 * Tenant isolation: a single-client scope is asserted against the caller's
 * accessible list; the all-clients scope is constrained to that list (which
 * already excludes soft-deleted workspaces — F2).
 */

export type ReportDetailRow = {
  id: string;
  email: string | null;
  subject: string | null;
  whenIso: string | null;
  detail: string | null;
  /** Optional link to a deeper view (e.g. the reply detail page). */
  href: string | null;
  clientId: string;
  clientName: string;
};

export type ReportDetailResult = {
  rows: ReportDetailRow[];
  /** True when more than `cap` rows matched — the list was capped. */
  truncated: boolean;
  cap: number;
};

/** Hard cap on rows returned to a single drill-down view. */
const CAP = 500;

const iso = (d: Date | null | undefined): string | null =>
  d ? d.toISOString() : null;

type Scope = { clientId: string } | { clientId: { in: string[] } };

export async function loadReportDetail(input: {
  metric: ReportDetailMetricKey;
  clientId: string | null;
  accessibleClientIds: string[];
  window?: MetricsWindow;
}): Promise<ReportDetailResult> {
  const { metric, clientId, accessibleClientIds } = input;

  if (clientId) {
    assertClientInAccessibleList(clientId, accessibleClientIds);
  }
  if (accessibleClientIds.length === 0) {
    return { rows: [], truncated: false, cap: CAP };
  }

  // Only apply the date window to metrics that are windowed in the counts.
  const w = REPORT_DETAIL_METRICS[metric].windowed ? input.window : undefined;
  const scope: Scope = clientId
    ? { clientId }
    : { clientId: { in: accessibleClientIds } };

  const rows = await queryMetric(metric, scope, w);
  return {
    rows: rows.slice(0, CAP),
    truncated: rows.length > CAP,
    cap: CAP,
  };
}

async function queryMetric(
  metric: ReportDetailMetricKey,
  scope: Scope,
  w: MetricsWindow | undefined,
): Promise<ReportDetailRow[]> {
  const take = CAP + 1; // one extra row tells us whether the list was capped
  const withClient = { select: { name: true } } as const;

  switch (metric) {
    case "sent": {
      const r = await prisma.outboundEmail.findMany({
        where: {
          ...scope,
          status: { in: ["SENT", "DELIVERED", "REPLIED", "BOUNCED"] },
          ...(w
            ? { sentAt: w }
            : {
                OR: [
                  { sentAt: { not: null } },
                  { providerMessageId: { not: null } },
                ],
              }),
        },
        orderBy: { sentAt: { sort: "desc", nulls: "last" } },
        take,
        select: {
          id: true,
          toEmail: true,
          subject: true,
          sentAt: true,
          status: true,
          clientId: true,
          client: withClient,
        },
      });
      return r.map((o) => ({
        id: o.id,
        email: o.toEmail,
        subject: o.subject,
        whenIso: iso(o.sentAt),
        detail: o.status,
        href: null,
        clientId: o.clientId,
        clientName: o.client.name,
      }));
    }

    case "queued": {
      const r = await prisma.outboundEmail.findMany({
        where: {
          ...scope,
          status: { in: ["REQUESTED", "PREPARING", "QUEUED", "PROCESSING"] },
        },
        orderBy: { createdAt: "desc" },
        take,
        select: {
          id: true,
          toEmail: true,
          subject: true,
          queuedAt: true,
          createdAt: true,
          status: true,
          clientId: true,
          client: withClient,
        },
      });
      return r.map((o) => ({
        id: o.id,
        email: o.toEmail,
        subject: o.subject,
        whenIso: iso(o.queuedAt ?? o.createdAt),
        detail: o.status,
        href: null,
        clientId: o.clientId,
        clientName: o.client.name,
      }));
    }

    case "delivered": {
      const r = await prisma.outboundEmail.findMany({
        where: { ...scope, status: "DELIVERED", deliveredAt: w ?? { not: null } },
        orderBy: { deliveredAt: { sort: "desc", nulls: "last" } },
        take,
        select: {
          id: true,
          toEmail: true,
          subject: true,
          deliveredAt: true,
          clientId: true,
          client: withClient,
        },
      });
      return r.map((o) => ({
        id: o.id,
        email: o.toEmail,
        subject: o.subject,
        whenIso: iso(o.deliveredAt),
        detail: "delivered",
        href: null,
        clientId: o.clientId,
        clientName: o.client.name,
      }));
    }

    case "bounces": {
      const r = await prisma.outboundEmail.findMany({
        where: {
          ...scope,
          status: "BOUNCED",
          ...(w ? { OR: [{ bouncedAt: w }, { bouncedAt: null, sentAt: w }] } : {}),
        },
        orderBy: { bouncedAt: { sort: "desc", nulls: "last" } },
        take,
        select: {
          id: true,
          toEmail: true,
          subject: true,
          bouncedAt: true,
          sentAt: true,
          bounceCategory: true,
          clientId: true,
          client: withClient,
        },
      });
      return r.map((o) => ({
        id: o.id,
        email: o.toEmail,
        subject: o.subject,
        whenIso: iso(o.bouncedAt ?? o.sentAt),
        detail: o.bounceCategory ?? "bounced",
        href: null,
        clientId: o.clientId,
        clientName: o.client.name,
      }));
    }

    case "failed": {
      const r = await prisma.outboundEmail.findMany({
        where: { ...scope, status: "FAILED", ...(w ? { createdAt: w } : {}) },
        orderBy: { createdAt: "desc" },
        take,
        select: {
          id: true,
          toEmail: true,
          subject: true,
          createdAt: true,
          failureReason: true,
          lastErrorMessage: true,
          clientId: true,
          client: withClient,
        },
      });
      return r.map((o) => ({
        id: o.id,
        email: o.toEmail,
        subject: o.subject,
        whenIso: iso(o.createdAt),
        detail: o.failureReason ?? o.lastErrorMessage ?? "failed",
        href: null,
        clientId: o.clientId,
        clientName: o.client.name,
      }));
    }

    case "opens": {
      const r = await prisma.outboundEmail.findMany({
        where: { ...scope, openedAt: w ?? { not: null } },
        orderBy: { openedAt: { sort: "desc", nulls: "last" } },
        take,
        select: {
          id: true,
          toEmail: true,
          subject: true,
          openedAt: true,
          clientId: true,
          client: withClient,
        },
      });
      return r.map((o) => ({
        id: o.id,
        email: o.toEmail,
        subject: o.subject,
        whenIso: iso(o.openedAt),
        detail: "opened",
        href: null,
        clientId: o.clientId,
        clientName: o.client.name,
      }));
    }

    case "replies": {
      const r = await prisma.inboundReply.findMany({
        where: {
          ...scope,
          matchMethod: { not: "UNLINKED" },
          linkedOutboundEmailId: { not: null },
          ...(w ? { receivedAt: w } : {}),
        },
        orderBy: { receivedAt: "desc" },
        take,
        select: {
          id: true,
          fromEmail: true,
          subject: true,
          snippet: true,
          receivedAt: true,
          clientId: true,
          client: withClient,
        },
      });
      return r.map((o) => ({
        id: o.id,
        email: o.fromEmail,
        subject: o.subject ?? o.snippet,
        whenIso: iso(o.receivedAt),
        detail: null,
        href: `/clients/${o.clientId}/activity/replies/${o.id}`,
        clientId: o.clientId,
        clientName: o.client.name,
      }));
    }

    case "unsubscribes": {
      const r = await prisma.unsubscribeToken.findMany({
        where: { ...scope, usedAt: w ?? { not: null } },
        orderBy: { usedAt: { sort: "desc", nulls: "last" } },
        take,
        select: {
          id: true,
          email: true,
          usedAt: true,
          clientId: true,
          client: withClient,
        },
      });
      return r.map((o) => ({
        id: o.id,
        email: o.email,
        subject: null,
        whenIso: iso(o.usedAt),
        detail: "opted out",
        href: null,
        clientId: o.clientId,
        clientName: o.client.name,
      }));
    }

    case "suppressed": {
      const r = await prisma.clientEmailSequenceStepSend.findMany({
        where: {
          ...scope,
          status: { in: ["SUPPRESSED", "SKIPPED", "BLOCKED"] },
          NOT: { blockedReason: { contains: "cooldown", mode: "insensitive" } },
        },
        orderBy: { updatedAt: "desc" },
        take,
        select: {
          id: true,
          status: true,
          blockedReason: true,
          subjectPreview: true,
          updatedAt: true,
          clientId: true,
          client: withClient,
          contact: { select: { email: true } },
        },
      });
      return r.map((o) => ({
        id: o.id,
        email: o.contact?.email ?? null,
        subject: o.subjectPreview,
        whenIso: iso(o.updatedAt),
        detail: o.blockedReason ?? o.status,
        href: null,
        clientId: o.clientId,
        clientName: o.client.name,
      }));
    }
  }
}
