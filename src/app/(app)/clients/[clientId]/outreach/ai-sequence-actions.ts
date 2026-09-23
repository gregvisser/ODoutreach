"use server";

import { redirect } from "next/navigation";

import { logger } from "@/lib/logger";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { beginSequenceDraftRun } from "@/server/ai/sequence-draft-run";
import { requireClientEmailTemplateMutator } from "@/server/email-templates/mutator-access";
import { requireClientAccess } from "@/server/tenant/access";

/**
 * Server action behind the "Write a sequence with AI" button.
 *
 * Authorisation is the same gate as writing a template by hand. The action
 * does not call the model and does not send mail. It records a draft run and
 * redirects at once; the model call runs after the response is closed. See
 * `sequence-draft-run.ts` for why the browser request must not wait.
 */

export async function draftClientSequenceWithAiAction(formData: FormData): Promise<void> {
  const staff = await requireOpensDoorsStaff();
  const clientId = String(formData.get("clientId") ?? "").trim();
  if (!clientId) throw new Error("Missing clientId.");

  await requireClientAccess(staff, clientId);
  await requireClientEmailTemplateMutator(staff, clientId);

  let runId: string;
  try {
    const started = await beginSequenceDraftRun({
      clientId,
      staffUserId: staff.id,
    });
    runId = started.runId;
  } catch (err) {
    logger.error(
      { err, scope: "ai.sequence-draft", clientId },
      "Could not start a sequence draft run",
    );
    const params = new URLSearchParams();
    params.set(
      "templateError",
      "The sequence could not be started. Nothing was drafted and nothing was sent.",
    );
    redirect(`/clients/${clientId}/templates?${params.toString()}#ai-sequence-draft`);
  }

  const params = new URLSearchParams();
  params.set("sequenceDraft", runId);
  redirect(`/clients/${clientId}/templates?${params.toString()}#ai-sequence-draft`);
}
