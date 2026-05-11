"use server";

import { revalidatePath } from "next/cache";

import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { createClientContactListFromUniverseContacts } from "@/server/contacts/universe-to-client-list";
import { requireClientAccess } from "@/server/tenant/access";

export type CreateListFromUniverseActionResult =
  | {
      ok: true;
      result: Awaited<ReturnType<typeof createClientContactListFromUniverseContacts>>;
    }
  | { ok: false; error: string };

export async function createListFromUniverseAction(
  formData: FormData,
): Promise<CreateListFromUniverseActionResult> {
  const staff = await requireOpensDoorsStaff();
  const clientId = String(formData.get("clientId") ?? "").trim();
  const listName = String(formData.get("listName") ?? "").trim();
  const rawIds = String(formData.get("universeContactIds") ?? "").trim();
  const ids = rawIds.split(",").map((s) => s.trim()).filter(Boolean);

  if (!clientId || !listName) {
    return { ok: false, error: "Choose a client workspace and enter a list name." };
  }
  if (ids.length === 0) {
    return { ok: false, error: "Select at least one Universe contact." };
  }

  try {
    await requireClientAccess(staff, clientId);
  } catch {
    return { ok: false, error: "You do not have access to that client workspace." };
  }

  try {
    const result = await createClientContactListFromUniverseContacts({
      clientId,
      listName,
      universeContactIds: ids,
      addedByStaffUserId: staff.id,
    });
    revalidatePath("/universe");
    revalidatePath("/contacts");
    revalidatePath(`/clients/${clientId}`);
    revalidatePath(`/clients/${clientId}/outreach`);
    return { ok: true, result };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not create the list.";
    return { ok: false, error: msg };
  }
}
