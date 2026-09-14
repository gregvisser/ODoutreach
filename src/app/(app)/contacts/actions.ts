"use server";

import { requireOpensDoorsStaff } from "@/server/auth/staff";
import {
  resolveImportListForClient,
  resolveImportListTarget,
} from "@/server/contacts/contact-lists";
import { runContactCsvImport } from "@/server/contacts/import-csv";
import { requireClientAccess } from "@/server/tenant/access";

export type CsvImportOutcome =
  | { kind: "saved"; message: string; href: string }
  | { kind: "invalid" | "uncertain"; message: string };

export async function importContactsCsvAction(formData: FormData): Promise<CsvImportOutcome> {
  const staff = await requireOpensDoorsStaff();
  const clientId = String(formData.get("clientId") ?? "").trim();
  const file = formData.get("file");
  const existingListId =
    String(formData.get("existingListId") ?? "").trim() || null;
  const newListName = String(formData.get("newListName") ?? "").trim() || null;
  // PR G: the UI now funnels every operator through a Preview step before
  // surfacing the "Confirm import" button. The button submits the same form
  // with `confirm=yes`; any submission without that flag is treated as a
  // mistake (e.g. a browser that re-submitted the Preview form directly)
  // and is rejected with a friendly message instead of silently writing.
  const confirmed = String(formData.get("confirm") ?? "").trim() === "yes";
  const returnToSources =
    String(formData.get("returnTo") ?? "").trim() === "sources";
  // Where to send the operator afterwards. The Sources tab locks the client
  // and wants the result shown there; everything else falls back to /contacts.
  // The path is built from the validated clientId, never from a raw URL, so
  // this cannot become an open redirect.
  const dest =
    returnToSources && clientId
      ? `/clients/${clientId}/sources`
      : "/contacts";

  if (!clientId || !(file instanceof File) || file.size === 0) {
    return { kind: "invalid", message: "Choose a client and CSV file." };
  }

  if (!confirmed) {
    return { kind: "invalid", message: "Preview the import first, then press Confirm import to write contacts." };
  }

  await requireClientAccess(staff, clientId);

  // PR D2: every import must attach to a named list. The operator either
  // picks an existing list for this client or types a new list name.
  const target = resolveImportListTarget({ existingListId, newListName });
  if ("error" in target) {
    return { kind: "invalid", message: target.error };
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
    return { kind: code.startsWith("CONTACT_LIST_") ? "invalid" : "uncertain", message };
  }

  const text = await file.text();

  let result: Awaited<ReturnType<typeof runContactCsvImport>> | null = null;
  try {
    result = await runContactCsvImport({
      clientId,
      fileName: file.name || "upload.csv",
      csvText: text,
      contactListId: resolvedList.id,
      targetListName: resolvedList.name,
      addedByStaffUserId: staff.id,
    });
  } catch {
    return { kind: "uncertain", message: "The import did not finish normally. Some records may already have been saved." };
  }
  if (!result) {
    return { kind: "uncertain", message: "The import result could not be confirmed." };
  }

  // Return the save acknowledgement independently of rendering Sources again.
  // The explicit result link performs a fresh document load after confirmation.

  const q = new URLSearchParams({
    import: "ok",
    batch: result.batchId,
    imported: String(result.summary.imported),
    attached: String(result.summary.attachedExisting),
    skipped: String(
      result.summary.skippedInvalid + result.summary.skippedDuplicate,
    ),
    list: resolvedList.name,
    uNew: String(result.summary.universeCreated),
    uMatch: String(result.summary.universeMatched),
  });
  return {
    kind: "saved",
    message: `Import saved — created ${result.summary.imported}, attached ${result.summary.attachedExisting} existing contacts, skipped ${result.summary.skippedInvalid + result.summary.skippedDuplicate} into ${resolvedList.name}.`,
    href: `${dest}?${q.toString()}`,
  };
}
