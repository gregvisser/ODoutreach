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

/** Re-throw Next.js control-flow errors (redirect / notFound) instead of swallowing them. */
function isNextControlFlowError(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "digest" in e &&
    typeof (e as { digest?: unknown }).digest === "string" &&
    (e as { digest: string }).digest.startsWith("NEXT_")
  );
}

export async function createListFromUniverseAction(
  formData: FormData,
): Promise<CreateListFromUniverseActionResult> {
  // Whole action is guarded so an unexpected error (auth/session, DB, etc.)
  // returns a readable message in the UI instead of crashing the page with
  // Next's generic "This page couldn't load" boundary.
  try {
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
    if (isNextControlFlowError(e)) throw e;
    // Surfaces in the Azure App Service log stream for diagnosis.
    console.error("[universe:createListFromUniverse] failed:", e);
    const msg =
      e instanceof Error && e.message
        ? `Could not create the list: ${e.message}`
        : "Could not create the list. Please try again or contact support.";
    return { ok: false, error: msg };
  }
}
