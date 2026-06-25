"use server";

import type { ClientEmailTemplateCategory } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import {
  isPreSendPreviewEnabled,
  loadOutreachEmailPreview,
  type OutreachEmailPreviewResult,
} from "@/server/email-rendering/pre-send-preview";
import { requireClientAccess } from "@/server/tenant/access";

export type PreviewableSequence = {
  id: string;
  name: string;
  categories: ClientEmailTemplateCategory[];
};

export type ListPreviewableSequencesResult =
  | { ok: true; sequences: PreviewableSequence[] }
  | { ok: false; error: string };

/** Feature B — sequences (+ which step categories have a template) for the preview picker. */
export async function listPreviewableSequencesAction(
  clientId: string,
): Promise<ListPreviewableSequencesResult> {
  try {
    const staff = await requireOpensDoorsStaff();
    await requireClientAccess(staff, clientId);
    if (!isPreSendPreviewEnabled()) {
      return { ok: false, error: "Pre-send preview is not enabled." };
    }
    const seqs = await prisma.clientEmailSequence.findMany({
      where: { clientId, status: { not: "ARCHIVED" } },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        steps: {
          select: { category: true, template: { select: { id: true } } },
        },
      },
    });
    return {
      ok: true,
      sequences: seqs.map((s) => ({
        id: s.id,
        name: s.name,
        categories: s.steps
          .filter((st) => st.template)
          .map((st) => st.category),
      })),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to load sequences" };
  }
}

/** Feature B — render the exact final email for a (sequence, step, contact?) selection. */
export async function previewOutreachEmailAction(input: {
  clientId: string;
  sequenceId: string;
  category: ClientEmailTemplateCategory;
  contactId?: string | null;
}): Promise<OutreachEmailPreviewResult> {
  try {
    const staff = await requireOpensDoorsStaff();
    return await loadOutreachEmailPreview({
      staff,
      clientId: input.clientId,
      sequenceId: input.sequenceId,
      category: input.category,
      contactId: input.contactId ?? null,
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Preview failed" };
  }
}
