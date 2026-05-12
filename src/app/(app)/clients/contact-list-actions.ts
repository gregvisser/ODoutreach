"use server";

import { revalidatePath } from "next/cache";

import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { deleteOrArchiveClientContactList } from "@/server/contacts/contact-lists";
import { requireClientAccess } from "@/server/tenant/access";

export type DeleteClientContactListResult =
  | { ok: true; mode: "deleted" }
  | { ok: true; mode: "archived"; message: string }
  | { ok: false; error: string };

export async function deleteClientContactListAction(
  formData: FormData,
): Promise<DeleteClientContactListResult> {
  const staff = await requireOpensDoorsStaff();
  const clientId = String(formData.get("clientId") ?? "").trim();
  const listId = String(formData.get("listId") ?? "").trim();
  if (!clientId || !listId) {
    return { ok: false, error: "Missing client or list." };
  }
  try {
    await requireClientAccess(staff, clientId);
  } catch {
    return { ok: false, error: "Access denied." };
  }

  const r = await deleteOrArchiveClientContactList({ clientId, listId });
  if (!r.ok) return r;

  revalidatePath(`/clients/${clientId}/sources`);
  revalidatePath(`/clients/${clientId}/contacts`);
  revalidatePath("/contacts");
  return r;
}
