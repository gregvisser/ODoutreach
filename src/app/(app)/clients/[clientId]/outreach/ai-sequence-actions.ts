"use server";

import { redirect, unstable_rethrow } from "next/navigation";

import {
  SEQUENCE_DRAFT_START_FAILED_MESSAGE,
  sequenceDraftClientId,
} from "@/lib/ai/sequence-draft-start";
import { reportError } from "@/lib/logger";
import { beginSequenceDraftRun } from "@/server/ai/sequence-draft-run";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { requireClientEmailTemplateMutator } from "@/server/email-templates/mutator-access";
import { requireClientAccess } from "@/server/tenant/access";

/**
 * Server action behind "Write a sequence with AI".
 *
 * It records a draft run and redirects. It does not call the model and it
 * does not send mail. The model runs after the response closes — see
 * `sequence-draft-run.ts`.
 *
 * Every non-redirect failure is logged and turned into the same
 * `templateError` banner. On the previous action, `requireOpensDoorsStaff`,
 * client access, the template mutator, a missing id, and `loadBrief` all
 * threw with nobody to catch them. Next delivered that as a failed action,
 * `error.tsx` painted "The action didn't complete", and the banner never
 * appeared. A throw before the model call does that in under a second. A
 * throw after a pool wait can look like the ~30s failure. Only a failure
 * that reaches `redirect()` shows the banner (the ~80–90s provider abort).
 */

function redirectToStartFailure(clientId: string): never {
  const params = new URLSearchParams();
  params.set("templateError", SEQUENCE_DRAFT_START_FAILED_MESSAGE);
  redirect(`/clients/${clientId}/templates?${params.toString()}#ai-sequence-draft`);
}

export async function draftClientSequenceWithAiAction(formData: FormData): Promise<void> {
  const rawClientId = formData.get("clientId");
  const clientId = sequenceDraftClientId(typeof rawClientId === "string" ? rawClientId : "");

  try {
    const staff = await requireOpensDoorsStaff();
    if (!clientId) {
      reportError(new Error("Missing clientId."), { scope: "ai.sequence-draft" });
      return;
    }

    await requireClientAccess(staff, clientId);
    await requireClientEmailTemplateMutator(staff, clientId);

    const started = await beginSequenceDraftRun({
      clientId,
      staffUserId: staff.id,
    });
    const params = new URLSearchParams();
    params.set("sequenceDraft", started.runId);
    redirect(`/clients/${clientId}/templates?${params.toString()}#ai-sequence-draft`);
  } catch (err) {
    unstable_rethrow(err);
    reportError(err, { scope: "ai.sequence-draft", clientId: clientId ?? undefined });
    if (!clientId) return;
    redirectToStartFailure(clientId);
  }
}
