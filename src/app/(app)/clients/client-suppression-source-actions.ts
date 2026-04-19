"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { SuppressionListKind } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { extractGoogleSpreadsheetId } from "@/lib/spreadsheet-url";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { syncSuppressionSourceFromGoogle } from "@/server/integrations/google-sheets/suppression-sync";
import { SUPPRESSION_SYNC_MESSAGES } from "@/server/integrations/google-sheets/suppression-sync-errors";
import { requireClientAccess } from "@/server/tenant/access";

const schema = z.object({
  clientId: z.string().min(1),
  kind: z.enum(["EMAIL", "DOMAIN"]),
  urlOrId: z.string().min(1),
  sheetRange: z.string().optional(),
});

/**
 * Set or create a suppression source spreadsheet id from a Google Sheet URL or raw id.
 */
export async function upsertSuppressionSpreadsheetAction(
  input: z.infer<typeof schema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const staff = await requireOpensDoorsStaff();
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid suppression form." };
  }
  try {
    await requireClientAccess(staff, parsed.data.clientId);
  } catch {
    return { ok: false, error: "Access denied." };
  }

  const spreadsheetId = extractGoogleSpreadsheetId(parsed.data.urlOrId);
  if (!spreadsheetId) {
    return {
      ok: false,
      error:
        "Could not parse a Google Spreadsheet id from that value — paste the full Sheet URL or the id from the address bar.",
    };
  }

  const kind = parsed.data.kind as SuppressionListKind;
  const range = parsed.data.sheetRange?.trim() || null;

  const existing = await prisma.suppressionSource.findFirst({
    where: { clientId: parsed.data.clientId, kind },
  });

  if (existing) {
    await prisma.suppressionSource.update({
      where: { id: existing.id },
      data: {
        spreadsheetId,
        sheetRange: range,
        syncStatus: "NOT_CONFIGURED",
        lastError: null,
      },
    });
  } else {
    await prisma.suppressionSource.create({
      data: {
        clientId: parsed.data.clientId,
        kind,
        spreadsheetId,
        sheetRange: range,
        label:
          kind === "EMAIL"
            ? "Email suppression (workspace)"
            : "Domain suppression (workspace)",
        syncStatus: "NOT_CONFIGURED",
      },
    });
  }

  revalidatePath(`/clients/${parsed.data.clientId}`);
  revalidatePath("/suppression");
  return { ok: true };
}

export type SyncClientSuppressionSourceResult =
  | { ok: true; rowsWritten: number; warning?: string }
  | { ok: false; error: string };

async function syncClientSuppressionSourceByKind(
  clientId: string,
  kind: SuppressionListKind,
): Promise<SyncClientSuppressionSourceResult> {
  const staff = await requireOpensDoorsStaff();
  try {
    await requireClientAccess(staff, clientId);
  } catch {
    return { ok: false, error: "Access denied." };
  }

  const source = await prisma.suppressionSource.findFirst({
    where: { clientId, kind },
  });
  if (!source) {
    return {
      ok: false,
      error: "Save a Google Sheet URL for this list first, then sync.",
    };
  }
  if (!source.spreadsheetId?.trim()) {
    return { ok: false, error: SUPPRESSION_SYNC_MESSAGES.spreadsheetMissing };
  }

  const result = await syncSuppressionSourceFromGoogle({ sourceId: source.id });
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/contacts");
  revalidatePath("/suppression");

  if (!result.ok) {
    return { ok: false, error: result.error ?? "Sync failed." };
  }
  return {
    ok: true,
    rowsWritten: result.rowsWritten ?? 0,
    warning: result.warning,
  };
}

export async function syncClientEmailSuppressionSourceAction(
  clientId: string,
): Promise<SyncClientSuppressionSourceResult> {
  return syncClientSuppressionSourceByKind(clientId, "EMAIL");
}

export async function syncClientDomainSuppressionSourceAction(
  clientId: string,
): Promise<SyncClientSuppressionSourceResult> {
  return syncClientSuppressionSourceByKind(clientId, "DOMAIN");
}
