import "server-only";

import type {
  ClientEmailTemplateCategory,
  ClientEmailTemplateStatus,
} from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import {
  TEMPLATE_CATEGORY_ORDER,
  TEMPLATE_STATUS_ORDER,
} from "@/lib/email-templates/template-policy";

/**
 * Server-side, client-scoped queries for `ClientEmailTemplate` (PR D4a).
 * Callers must have already resolved `clientId` through
 * `requireClientAccess` / `getAccessibleClientIds` — these helpers do
 * NOT re-check staff auth.
 */

export type TemplateSummary = {
  id: string;
  clientId: string;
  name: string;
  category: ClientEmailTemplateCategory;
  status: ClientEmailTemplateStatus;
  subject: string;
  content: string;
  subjectPreview: string;
  contentPreview: string;
  createdAtIso: string;
  updatedAtIso: string;
  approvedAtIso: string | null;
  archivedAtIso: string | null;
  createdBy: { id: string; name: string | null; email: string } | null;
  approvedBy: { id: string; name: string | null; email: string } | null;
};

export type TemplateCounts = {
  total: number;
  byStatus: Record<ClientEmailTemplateStatus, number>;
  byCategory: Record<ClientEmailTemplateCategory, number>;
  approvedByCategory: Record<ClientEmailTemplateCategory, number>;
};

export type ClientEmailTemplatesOverview = {
  templates: TemplateSummary[];
  counts: TemplateCounts;
};

const SUBJECT_PREVIEW_MAX = 160;
const CONTENT_PREVIEW_MAX = 220;

function previewOf(text: string, max: number): string {
  const trimmed = (text ?? "").replace(/\s+/g, " ").trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function makeCounts(
  rows: Array<{
    status: ClientEmailTemplateStatus;
    category: ClientEmailTemplateCategory;
  }>,
): TemplateCounts {
  const byStatus = Object.fromEntries(
    TEMPLATE_STATUS_ORDER.map((s) => [s, 0]),
  ) as Record<ClientEmailTemplateStatus, number>;
  const byCategory = Object.fromEntries(
    TEMPLATE_CATEGORY_ORDER.map((c) => [c, 0]),
  ) as Record<ClientEmailTemplateCategory, number>;
  const approvedByCategory = Object.fromEntries(
    TEMPLATE_CATEGORY_ORDER.map((c) => [c, 0]),
  ) as Record<ClientEmailTemplateCategory, number>;

  for (const r of rows) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    byCategory[r.category] = (byCategory[r.category] ?? 0) + 1;
    if (r.status === "APPROVED") {
      approvedByCategory[r.category] =
        (approvedByCategory[r.category] ?? 0) + 1;
    }
  }

  return { total: rows.length, byStatus, byCategory, approvedByCategory };
}

/**
 * Load every template for a client (client-scoped, ordered for display)
 * along with per-status / per-category counts. Used by the Outreach
 * page server component.
 */
export async function loadClientEmailTemplatesOverview(
  clientId: string,
): Promise<ClientEmailTemplatesOverview> {
  if (!clientId) {
    return {
      templates: [],
      counts: makeCounts([]),
    };
  }

  const rows = await prisma.clientEmailTemplate.findMany({
    where: { clientId },
    orderBy: [{ category: "asc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      clientId: true,
      name: true,
      category: true,
      status: true,
      subject: true,
      content: true,
      createdAt: true,
      updatedAt: true,
      approvedAt: true,
      archivedAt: true,
      createdBy: { select: { id: true, displayName: true, email: true } },
      approvedBy: { select: { id: true, displayName: true, email: true } },
    },
  });

  const templates: TemplateSummary[] = rows.map((r) => ({
    id: r.id,
    clientId: r.clientId,
    name: r.name,
    category: r.category,
    status: r.status,
    subject: r.subject,
    content: r.content,
    subjectPreview: previewOf(r.subject, SUBJECT_PREVIEW_MAX),
    contentPreview: previewOf(r.content, CONTENT_PREVIEW_MAX),
    createdAtIso: r.createdAt.toISOString(),
    updatedAtIso: r.updatedAt.toISOString(),
    approvedAtIso: r.approvedAt ? r.approvedAt.toISOString() : null,
    archivedAtIso: r.archivedAt ? r.archivedAt.toISOString() : null,
    createdBy: r.createdBy
      ? {
          id: r.createdBy.id,
          name: r.createdBy.displayName,
          email: r.createdBy.email,
        }
      : null,
    approvedBy: r.approvedBy
      ? {
          id: r.approvedBy.id,
          name: r.approvedBy.displayName,
          email: r.approvedBy.email,
        }
      : null,
  }));

  const counts = makeCounts(
    rows.map((r) => ({ status: r.status, category: r.category })),
  );

  return { templates, counts };
}
