"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import { syncSuppressionSourceFromGoogle } from "@/server/integrations/google-sheets/suppression-sync";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { requireClientAccess } from "@/server/tenant/access";

export async function runSuppressionSyncAction(formData: FormData): Promise<void> {
  const staff = await requireOpensDoorsStaff();
  const sourceId = String(formData.get("sourceId") ?? "").trim();
  if (!sourceId) {
    redirect("/suppression?sync=error&message=" + encodeURIComponent("Missing source"));
  }

  const source = await prisma.suppressionSource.findUnique({
    where: { id: sourceId },
  });
  if (!source) {
    redirect("/suppression?sync=error&message=" + encodeURIComponent("Not found"));
  }

  await requireClientAccess(staff, source.clientId);

  const result = await syncSuppressionSourceFromGoogle({ sourceId });

  revalidatePath("/suppression");
  revalidatePath("/contacts");
  revalidatePath(`/clients/${source.clientId}`);

  if (result.ok) {
    redirect(
      `/suppression?sync=ok&rows=${result.rowsWritten ?? 0}&client=${source.clientId}`,
    );
  }
  redirect(
    "/suppression?sync=error&message=" +
      encodeURIComponent(result.error ?? "Sync failed"),
  );
}
