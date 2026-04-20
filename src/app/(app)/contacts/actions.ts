"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireOpensDoorsStaff } from "@/server/auth/staff";
import {
  resolveImportListForClient,
  resolveImportListTarget,
} from "@/server/contacts/contact-lists";
import { runContactCsvImport } from "@/server/contacts/import-csv";
import { requireClientAccess } from "@/server/tenant/access";

export async function importContactsCsvAction(formData: FormData): Promise<void> {
  const staff = await requireOpensDoorsStaff();
  const clientId = String(formData.get("clientId") ?? "").trim();
  const file = formData.get("file");
  const existingListId =
    String(formData.get("existingListId") ?? "").trim() || null;
  const newListName = String(formData.get("newListName") ?? "").trim() || null;

  if (!clientId || !(file instanceof File) || file.size === 0) {
    redirect(
      "/contacts?import=error&message=" +
        encodeURIComponent("Choose a client and CSV file."),
    );
  }

  await requireClientAccess(staff, clientId);

  // PR D2: every import must attach to a named list. The operator either
  // picks an existing list for this client or types a new list name.
  const target = resolveImportListTarget({ existingListId, newListName });
  if ("error" in target) {
    redirect(
      "/contacts?import=error&message=" + encodeURIComponent(target.error),
    );
  }

  let resolvedList: { id: string; name: string; clientId: string | null };
  try {
    resolvedList = await resolveImportListForClient({
      clientId,
      target,
      createdByStaffUserId: staff.id,
    });
  } catch (e) {
    const code = e instanceof Error ? e.message : String(e);
    const message =
      code === "CONTACT_LIST_NOT_FOUND"
        ? "Selected list no longer exists — choose another or type a new name."
        : code === "CONTACT_LIST_WRONG_CLIENT"
          ? "Selected list belongs to a different client workspace."
          : code === "CONTACT_LIST_NAME_REQUIRED"
            ? "Enter a list name before importing."
            : code === "CONTACT_LIST_NAME_TOO_LONG"
              ? "List name must be 120 characters or fewer."
              : "Could not resolve the target list.";
    redirect(
      "/contacts?import=error&message=" + encodeURIComponent(message),
    );
  }

  const text = await file.text();

  let result: Awaited<ReturnType<typeof runContactCsvImport>> | null = null;
  try {
    result = await runContactCsvImport({
      clientId,
      fileName: file.name || "upload.csv",
      csvText: text,
      contactListId: resolvedList.id,
      addedByStaffUserId: staff.id,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Import failed";
    redirect(
      "/contacts?import=error&message=" + encodeURIComponent(message),
    );
  }
  if (!result) {
    redirect(
      "/contacts?import=error&message=" + encodeURIComponent("Import failed"),
    );
  }

  revalidatePath("/contacts");
  revalidatePath("/dashboard");
  revalidatePath(`/clients/${clientId}`);
  revalidatePath(`/clients/${clientId}/sources`);

  const q = new URLSearchParams({
    import: "ok",
    batch: result.batchId,
    imported: String(result.summary.imported),
    skipped: String(
      result.summary.skippedInvalid + result.summary.skippedDuplicate,
    ),
    list: resolvedList.name,
  });
  redirect(`/contacts?${q.toString()}`);
}
