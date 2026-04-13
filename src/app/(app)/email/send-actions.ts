"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { sendEmailToContact } from "@/server/email/send-outbound";

function contactsRedirect(
  clientId: string | undefined,
  params: Record<string, string | undefined>,
) {
  const q = new URLSearchParams();
  if (clientId) q.set("client", clientId);
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === "") continue;
    q.set(k, v);
  }
  const qs = q.toString();
  return qs ? `/contacts?${qs}` : "/contacts";
}

export async function sendEmailToContactAction(formData: FormData): Promise<void> {
  const staff = await requireOpensDoorsStaff();
  const clientId = String(formData.get("clientId") ?? "").trim();
  const contactId = String(formData.get("contactId") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  const bodyText = String(formData.get("bodyText") ?? "").trim();

  if (!clientId || !contactId || !subject || !bodyText) {
    redirect(
      contactsRedirect(clientId || undefined, {
        send: "error",
        message: "Subject and message are required.",
      }),
    );
  }

  const result = await sendEmailToContact({
    staff,
    clientId,
    contactId,
    subject,
    bodyText,
  });

  const outboundId =
    "outboundEmailId" in result && result.outboundEmailId
      ? result.outboundEmailId
      : undefined;
  if (outboundId) {
    revalidatePath(`/activity/outbound/${outboundId}`);
  }

  revalidatePath("/contacts");
  revalidatePath("/activity");
  revalidatePath("/dashboard");
  revalidatePath("/reporting");
  revalidatePath(`/clients/${clientId}`);

  if (!result.ok) {
    redirect(
      contactsRedirect(clientId, {
        send: "failed",
        id: result.outboundEmailId,
        message: result.error,
      }),
    );
  }

  if (result.outcome === "blocked_suppression") {
    redirect(
      contactsRedirect(clientId, {
        send: "blocked",
        id: result.outboundEmailId,
        reason: result.decision.reason,
      }),
    );
  }

  if (result.outcome === "queued") {
    redirect(
      contactsRedirect(clientId, {
        send: "queued",
        id: result.outboundEmailId,
      }),
    );
  }

  redirect(contactsRedirect(clientId, { send: "error", message: "Unexpected send result." }));
}
