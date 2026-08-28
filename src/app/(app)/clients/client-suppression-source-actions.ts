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
  // A1 notation ("Domains!A:A") or a bare tab name ("Domains"). Bounded because
  // it is passed straight to the Sheets API and stored; real ranges are tiny.
  sheetRange: z.string().max(200).optional(),
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
  // Absent and empty mean different things. An empty box is the operator
  // choosing the default; an ABSENT field is a caller that simply does not deal
  // in ranges, and must not null a range that is working — that would send the
  // client silently back to Sheet1, which is the outage this field fixes.
  const range = parsed.data.sheetRange?.trim() || null;
  const rangeProvided = parsed.data.sheetRange !== undefined;

  const existing = await prisma.suppressionSource.findFirst({
    where: { clientId: parsed.data.clientId, kind },
  });

  if (existing) {
    await prisma.suppressionSource.update({
      where: { id: existing.id },
      data: {
        spreadsheetId,
        ...(rangeProvided ? { sheetRange: range } : {}),
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
  | {
      ok: false;
      error: string;
      /**
       * Set when the sync was REFUSED for removing too much, never when it
       * failed for another reason. Its presence is what earns the operator a
       * "remove them anyway" control; without it, confirming would not help.
       */
      blockedShrink?: { previousCount: number; wouldWrite: number; removed: number };
    };

async function syncClientSuppressionSourceByKind(
  clientId: string,
  kind: SuppressionListKind,
  confirmShrink: boolean,
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

  const result = await syncSuppressionSourceFromGoogle({
    sourceId: source.id,
    confirmShrink,
  });
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/contacts");
  revalidatePath("/suppression");

  if (!result.ok) {
    return {
      ok: false,
      error: result.error ?? "Sync failed.",
      ...(result.blockedShrink
        ? {
            blockedShrink: {
              previousCount: result.blockedShrink.previousCount,
              wouldWrite: result.blockedShrink.wouldWrite,
              removed: result.blockedShrink.removed,
            },
          }
        : {}),
    };
  }
  return {
    ok: true,
    rowsWritten: result.rowsWritten ?? 0,
    warning: result.warning,
  };
}

export async function syncClientEmailSuppressionSourceAction(
  clientId: string,
  confirmShrink = false,
): Promise<SyncClientSuppressionSourceResult> {
  return syncClientSuppressionSourceByKind(clientId, "EMAIL", confirmShrink);
}

export async function syncClientDomainSuppressionSourceAction(
  clientId: string,
  confirmShrink = false,
): Promise<SyncClientSuppressionSourceResult> {
  return syncClientSuppressionSourceByKind(clientId, "DOMAIN", confirmShrink);
}
