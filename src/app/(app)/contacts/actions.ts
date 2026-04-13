"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { runContactCsvImport } from "@/server/contacts/import-csv";
import { requireClientAccess } from "@/server/tenant/access";

export async function importContactsCsvAction(formData: FormData): Promise<void> {
  const staff = await requireOpensDoorsStaff();
  const clientId = String(formData.get("clientId") ?? "").trim();
  const file = formData.get("file");

  if (!clientId || !(file instanceof File) || file.size === 0) {
    redirect("/contacts?import=error&message=" + encodeURIComponent("Choose a client and CSV file."));
  }

  await requireClientAccess(staff, clientId);

  const text = await file.text();

  try {
    const { batchId, summary } = await runContactCsvImport({
      clientId,
      fileName: file.name || "upload.csv",
      csvText: text,
    });

    revalidatePath("/contacts");
    revalidatePath("/dashboard");
    revalidatePath(`/clients/${clientId}`);

    const q = new URLSearchParams({
      import: "ok",
      batch: batchId,
      imported: String(summary.imported),
      skipped: String(summary.skippedInvalid + summary.skippedDuplicate),
    });
    redirect(`/contacts?${q.toString()}`);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Import failed";
    redirect("/contacts?import=error&message=" + encodeURIComponent(message));
  }
}
