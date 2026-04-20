"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireOpensDoorsStaff } from "@/server/auth/staff";
import {
  approveTemplate,
  archiveTemplate,
  createEmailTemplate,
  markTemplateReadyForReview,
  returnTemplateToDraft,
  TemplateMutationError,
  updateEmailTemplate,
} from "@/server/email-templates/mutations";
import { requireClientEmailTemplateMutator } from "@/server/email-templates/mutator-access";
import { requireClientAccess } from "@/server/tenant/access";

/**
 * Server actions used by the Outreach page "Client email templates"
 * section (PR D4a). Every action:
 *   1. re-verifies OpensDoors staff auth
 *   2. re-verifies client access + mutator permission
 *   3. delegates to a pure-ish server helper in
 *      `src/server/email-templates/mutations.ts`
 *   4. revalidates the outreach path and redirects back with a flash
 *
 * None of these actions send email or change mailbox/OAuth state.
 */

type ActionFlash =
  | { kind: "ok"; message: string }
  | { kind: "error"; message: string };

function redirectBack(clientId: string, flash: ActionFlash, focus?: string): never {
  const params = new URLSearchParams();
  params.set(
    flash.kind === "ok" ? "template" : "templateError",
    flash.message,
  );
  if (focus) params.set("templateId", focus);
  const search = params.toString();
  redirect(
    `/clients/${clientId}/outreach${search ? `?${search}` : ""}#client-email-templates`,
  );
}

function getClientIdFromForm(formData: FormData): string {
  const clientId = String(formData.get("clientId") ?? "").trim();
  if (!clientId) throw new Error("Missing clientId.");
  return clientId;
}

function flashForError(e: unknown): string {
  if (e instanceof TemplateMutationError) return e.message;
  if (e instanceof Error) return e.message;
  return "Could not complete template action.";
}

export async function createClientEmailTemplateAction(
  formData: FormData,
): Promise<void> {
  const staff = await requireOpensDoorsStaff();
  const clientId = getClientIdFromForm(formData);
  await requireClientAccess(staff, clientId);
  await requireClientEmailTemplateMutator(staff, clientId);

  const name = String(formData.get("name") ?? "");
  const category = String(formData.get("category") ?? "");
  const subject = String(formData.get("subject") ?? "");
  const content = String(formData.get("content") ?? "");

  try {
    const created = await createEmailTemplate({
      clientId,
      staffUserId: staff.id,
      name,
      category,
      subject,
      content,
    });
    revalidatePath(`/clients/${clientId}/outreach`);
    redirectBack(
      clientId,
      { kind: "ok", message: `Saved draft — ${created.name}` },
      created.id,
    );
  } catch (e) {
    // redirect() throws a digest error — only catch real failures here.
    if (e instanceof Error && e.message.startsWith("NEXT_")) throw e;
    redirectBack(clientId, { kind: "error", message: flashForError(e) });
  }
}

export async function updateClientEmailTemplateAction(
  formData: FormData,
): Promise<void> {
  const staff = await requireOpensDoorsStaff();
  const clientId = getClientIdFromForm(formData);
  const templateId = String(formData.get("templateId") ?? "").trim();
  if (!templateId) {
    redirectBack(clientId, {
      kind: "error",
      message: "Missing template id.",
    });
  }
  await requireClientAccess(staff, clientId);
  await requireClientEmailTemplateMutator(staff, clientId);

  const name = String(formData.get("name") ?? "");
  const category = String(formData.get("category") ?? "");
  const subject = String(formData.get("subject") ?? "");
  const content = String(formData.get("content") ?? "");

  try {
    const updated = await updateEmailTemplate({
      templateId,
      clientId,
      name,
      category,
      subject,
      content,
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
      templateId,
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
  const templateId = String(formData.get("templateId") ?? "").trim();
  if (!templateId) {
    redirectBack(clientId, {
      kind: "error",
      message: "Missing template id.",
    });
  }
  await requireClientAccess(staff, clientId);
  await requireClientEmailTemplateMutator(staff, clientId);

  try {
    let okMessage = "";
    switch (kind) {
      case "ready": {
        const row = await markTemplateReadyForReview({
          templateId,
          clientId,
          staffUserId: staff.id,
        });
        okMessage = `Marked ready for review — ${row.name}`;
        break;
      }
      case "approve": {
        const row = await approveTemplate({
          templateId,
          clientId,
          staffUserId: staff.id,
        });
        okMessage = `Approved — ${row.name}`;
        break;
      }
      case "archive": {
        const row = await archiveTemplate({
          templateId,
          clientId,
          staffUserId: staff.id,
        });
        okMessage = `Archived — ${row.name}`;
        break;
      }
      case "return_to_draft": {
        const row = await returnTemplateToDraft({
          templateId,
          clientId,
          staffUserId: staff.id,
        });
        okMessage = `Returned to draft — ${row.name}`;
        break;
      }
    }
    revalidatePath(`/clients/${clientId}/outreach`);
    redirectBack(clientId, { kind: "ok", message: okMessage }, templateId);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("NEXT_")) throw e;
    redirectBack(
      clientId,
      { kind: "error", message: flashForError(e) },
      templateId,
    );
  }
}

export async function markClientEmailTemplateReadyAction(
  formData: FormData,
): Promise<void> {
  await runStatusAction(formData, "ready");
}

export async function approveClientEmailTemplateAction(
  formData: FormData,
): Promise<void> {
  await runStatusAction(formData, "approve");
}

export async function archiveClientEmailTemplateAction(
  formData: FormData,
): Promise<void> {
  await runStatusAction(formData, "archive");
}

export async function returnClientEmailTemplateToDraftAction(
  formData: FormData,
): Promise<void> {
  await runStatusAction(formData, "return_to_draft");
}
