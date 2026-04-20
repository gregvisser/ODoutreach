"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { ClientEmailTemplateCategory } from "@/generated/prisma/enums";
import { TEMPLATE_CATEGORY_ORDER } from "@/lib/email-templates/template-policy";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import {
  enrollSequenceContacts,
  EnrollmentFailure,
} from "@/server/email-sequences/enrollments";
import {
  approveSequence,
  archiveSequence,
  createSequence,
  markSequenceReadyForReview,
  returnSequenceToDraft,
  SequenceMutationFailure,
  setSequenceSteps,
  updateSequenceMetadata,
} from "@/server/email-sequences/mutations";
import { requireClientEmailSequenceMutator } from "@/server/email-sequences/mutator-access";
import { requireClientAccess } from "@/server/tenant/access";

/**
 * Server actions used by the Outreach page "Email sequences" section
 * (PR D4b). Every action:
 *   1. re-verifies OpensDoors staff auth
 *   2. re-verifies client access + sequence mutator permission
 *   3. delegates to a server helper in
 *      `src/server/email-sequences/mutations.ts`
 *   4. revalidates the outreach path and redirects back with a flash
 *
 * None of these actions send email or enroll contacts.
 */

type ActionFlash =
  | { kind: "ok"; message: string }
  | { kind: "error"; message: string };

function redirectBack(
  clientId: string,
  flash: ActionFlash,
  focus?: string,
): never {
  const params = new URLSearchParams();
  params.set(
    flash.kind === "ok" ? "sequence" : "sequenceError",
    flash.message,
  );
  if (focus) params.set("sequenceId", focus);
  const search = params.toString();
  redirect(
    `/clients/${clientId}/outreach${search ? `?${search}` : ""}#client-email-sequences`,
  );
}

function getClientIdFromForm(formData: FormData): string {
  const clientId = String(formData.get("clientId") ?? "").trim();
  if (!clientId) throw new Error("Missing clientId.");
  return clientId;
}

function flashForError(e: unknown): string {
  if (e instanceof SequenceMutationFailure) return e.message;
  if (e instanceof EnrollmentFailure) return e.message;
  if (e instanceof Error) return e.message;
  return "Could not complete sequence action.";
}

function parseSteps(formData: FormData): Array<{
  category: ClientEmailTemplateCategory;
  templateId: string;
  delayDays: number;
}> {
  const steps: Array<{
    category: ClientEmailTemplateCategory;
    templateId: string;
    delayDays: number;
  }> = [];
  for (const category of TEMPLATE_CATEGORY_ORDER) {
    const templateId = String(formData.get(`template_${category}`) ?? "").trim();
    if (!templateId) continue;
    const rawDelay = String(
      formData.get(`delay_${category}`) ?? (category === "INTRODUCTION" ? "0" : "3"),
    ).trim();
    const parsedDelay = Number.parseInt(rawDelay, 10);
    const delayDays = Number.isFinite(parsedDelay) ? parsedDelay : 0;
    steps.push({
      category,
      templateId,
      delayDays: category === "INTRODUCTION" ? 0 : delayDays,
    });
  }
  return steps;
}

export async function createClientEmailSequenceAction(
  formData: FormData,
): Promise<void> {
  const staff = await requireOpensDoorsStaff();
  const clientId = getClientIdFromForm(formData);
  await requireClientAccess(staff, clientId);
  await requireClientEmailSequenceMutator(staff, clientId);

  const name = String(formData.get("name") ?? "");
  const description = String(formData.get("description") ?? "");
  const contactListId = String(formData.get("contactListId") ?? "");

  try {
    const created = await createSequence({
      clientId,
      staffUserId: staff.id,
      name,
      description: description.trim() ? description : null,
      contactListId,
    });

    const steps = parseSteps(formData);
    if (steps.length > 0) {
      await setSequenceSteps({
        sequenceId: created.id,
        clientId,
        steps,
        targetStatus: "DRAFT",
      });
    }

    revalidatePath(`/clients/${clientId}/outreach`);
    redirectBack(
      clientId,
      { kind: "ok", message: `Saved draft — ${created.name}` },
      created.id,
    );
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("NEXT_")) throw e;
    redirectBack(clientId, { kind: "error", message: flashForError(e) });
  }
}

export async function updateClientEmailSequenceAction(
  formData: FormData,
): Promise<void> {
  const staff = await requireOpensDoorsStaff();
  const clientId = getClientIdFromForm(formData);
  const sequenceId = String(formData.get("sequenceId") ?? "").trim();
  if (!sequenceId) {
    redirectBack(clientId, { kind: "error", message: "Missing sequence id." });
  }
  await requireClientAccess(staff, clientId);
  await requireClientEmailSequenceMutator(staff, clientId);

  const name = String(formData.get("name") ?? "");
  const description = String(formData.get("description") ?? "");
  const contactListId = String(formData.get("contactListId") ?? "");

  try {
    const updated = await updateSequenceMetadata({
      sequenceId,
      clientId,
      name,
      description: description.trim() ? description : null,
      contactListId,
    });

    const steps = parseSteps(formData);
    await setSequenceSteps({
      sequenceId,
      clientId,
      steps,
      targetStatus: "DRAFT",
    });

    revalidatePath(`/clients/${clientId}/outreach`);
    redirectBack(
      clientId,
      { kind: "ok", message: `Updated — ${updated.name}` },
      updated.id,
    );
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("NEXT_")) throw e;
    redirectBack(
      clientId,
      { kind: "error", message: flashForError(e) },
      sequenceId,
    );
  }
}

type StatusActionKind = "ready" | "approve" | "archive" | "return_to_draft";

async function runStatusAction(
  formData: FormData,
  kind: StatusActionKind,
): Promise<void> {
  const staff = await requireOpensDoorsStaff();
  const clientId = getClientIdFromForm(formData);
  const sequenceId = String(formData.get("sequenceId") ?? "").trim();
  if (!sequenceId) {
    redirectBack(clientId, { kind: "error", message: "Missing sequence id." });
  }
  await requireClientAccess(staff, clientId);
  await requireClientEmailSequenceMutator(staff, clientId);

  try {
    let okMessage = "";
    switch (kind) {
      case "ready": {
        const row = await markSequenceReadyForReview({
          sequenceId,
          clientId,
          staffUserId: staff.id,
        });
        okMessage = `Marked ready for review — ${row.name}`;
        break;
      }
      case "approve": {
        const row = await approveSequence({
          sequenceId,
          clientId,
          staffUserId: staff.id,
        });
        okMessage = `Approved — ${row.name}`;
        break;
      }
      case "archive": {
        const row = await archiveSequence({
          sequenceId,
          clientId,
          staffUserId: staff.id,
        });
        okMessage = `Archived — ${row.name}`;
        break;
      }
      case "return_to_draft": {
        const row = await returnSequenceToDraft({
          sequenceId,
          clientId,
          staffUserId: staff.id,
        });
        okMessage = `Returned to draft — ${row.name}`;
        break;
      }
    }
    revalidatePath(`/clients/${clientId}/outreach`);
    redirectBack(clientId, { kind: "ok", message: okMessage }, sequenceId);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("NEXT_")) throw e;
    redirectBack(
      clientId,
      { kind: "error", message: flashForError(e) },
      sequenceId,
    );
  }
}

export async function markClientEmailSequenceReadyAction(
  formData: FormData,
): Promise<void> {
  await runStatusAction(formData, "ready");
}

export async function approveClientEmailSequenceAction(
  formData: FormData,
): Promise<void> {
  await runStatusAction(formData, "approve");
}

export async function archiveClientEmailSequenceAction(
  formData: FormData,
): Promise<void> {
  await runStatusAction(formData, "archive");
}

export async function returnClientEmailSequenceToDraftAction(
  formData: FormData,
): Promise<void> {
  await runStatusAction(formData, "return_to_draft");
}

/**
 * PR D4c — idempotent "Create enrollment records" action.
 *
 * Records-only: no send, no schedule. Writes PENDING enrollments for
 * every email-sendable contact in the sequence's target list that is
 * not already enrolled. Suppressed / missing-email contacts are
 * skipped with counts surfaced in the flash message.
 */
export async function createClientEmailSequenceEnrollmentsAction(
  formData: FormData,
): Promise<void> {
  const staff = await requireOpensDoorsStaff();
  const clientId = getClientIdFromForm(formData);
  const sequenceId = String(formData.get("sequenceId") ?? "").trim();
  if (!sequenceId) {
    redirectBack(clientId, { kind: "error", message: "Missing sequence id." });
  }
  await requireClientAccess(staff, clientId);
  await requireClientEmailSequenceMutator(staff, clientId);

  try {
    const summary = await enrollSequenceContacts({
      sequenceId,
      clientId,
      staffUserId: staff.id,
    });
    revalidatePath(`/clients/${clientId}/outreach`);
    const parts: string[] = [];
    parts.push(
      summary.inserted === 1
        ? "1 contact enrolled"
        : `${String(summary.inserted)} contacts enrolled`,
    );
    if (summary.skipped.alreadyEnrolled > 0) {
      parts.push(
        `${String(summary.skipped.alreadyEnrolled)} already enrolled`,
      );
    }
    if (summary.skipped.suppressed > 0) {
      parts.push(`${String(summary.skipped.suppressed)} suppressed`);
    }
    if (summary.skipped.missingEmail > 0) {
      parts.push(`${String(summary.skipped.missingEmail)} without email`);
    }
    if (summary.skipped.missingIdentifier > 0) {
      parts.push(
        `${String(summary.skipped.missingIdentifier)} without identifier`,
      );
    }
    redirectBack(
      clientId,
      {
        kind: "ok",
        message: `${parts.join(" · ")} — no email sent`,
      },
      sequenceId,
    );
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("NEXT_")) throw e;
    redirectBack(
      clientId,
      { kind: "error", message: flashForError(e) },
      sequenceId,
    );
  }
}
