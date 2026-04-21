"use server";

import Papa from "papaparse";

import {
  buildCsvImportPreview,
  type ImportPreviewResult,
  type SuppressionLookup,
} from "@/lib/contacts/import-preview";
import { normalizeEmail, isValidEmailFormat } from "@/lib/normalize";
import { prisma } from "@/lib/db";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import {
  resolveImportListTarget,
  normalizeContactListName,
} from "@/server/contacts/contact-lists";
import { evaluateSuppression } from "@/server/outreach/suppression-guard";
import { requireClientAccess } from "@/server/tenant/access";

/**
 * PR G — read-only preview of a CSV import.
 *
 * Parses the CSV on the server, loads the current client's existing contacts
 * + evaluates suppression for each distinct email, and returns a pure
 * `ImportPreviewResult` for the UI to render. Does NOT write any data.
 *
 * The confirm-import action (`importContactsCsvAction`) re-parses the same
 * file server-side, so we never trust a stale client-held preview blindly.
 */
export type CsvImportPreviewActionInput = {
  clientId: string;
  existingListId?: string | null;
  newListName?: string | null;
  fileName: string;
  csvText: string;
};

export type CsvImportPreviewActionResult =
  | {
      ok: true;
      preview: ImportPreviewResult;
      resolvedListLabel: string;
      /** `existing` when routing to a named list that already exists. */
      resolvedListKind: "existing" | "new";
      fileName: string;
    }
  | { ok: false; error: string };

export async function previewContactsCsvAction(
  input: CsvImportPreviewActionInput,
): Promise<CsvImportPreviewActionResult> {
  const staff = await requireOpensDoorsStaff();
  const clientId = (input.clientId ?? "").trim();
  if (!clientId) {
    return { ok: false, error: "Choose a client workspace before previewing." };
  }
  await requireClientAccess(staff, clientId);

  const target = resolveImportListTarget({
    existingListId: input.existingListId ?? null,
    newListName: input.newListName ?? null,
  });
  if ("error" in target) {
    return { ok: false, error: target.error };
  }

  let resolvedListLabel: string;
  let resolvedListKind: "existing" | "new";
  if (target.kind === "existing") {
    const list = await prisma.contactList.findUnique({
      where: { id: target.listId },
      select: { id: true, name: true, clientId: true },
    });
    if (!list || list.clientId !== clientId) {
      return {
        ok: false,
        error:
          "Selected list no longer exists or belongs to another client workspace.",
      };
    }
    resolvedListLabel = list.name;
    resolvedListKind = "existing";
  } else {
    resolvedListLabel = normalizeContactListName(target.listName);
    resolvedListKind = "new";
  }

  const csvText = input.csvText ?? "";
  if (csvText.trim().length === 0) {
    return { ok: false, error: "CSV file is empty." };
  }

  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });

  const rawRows = parsed.data.filter((row) =>
    Object.values(row).some((v) => String(v ?? "").trim()),
  );

  const existing = await prisma.contact.findMany({
    where: { clientId },
    select: { id: true, email: true },
  });

  // Collect distinct normalized+valid emails from the file so we call the
  // suppression evaluator exactly once per candidate address.
  const distinctEmails = new Set<string>();
  for (const row of rawRows) {
    for (const [rawHeading, rawValue] of Object.entries(row)) {
      const normalizedHeading = rawHeading.trim().toLowerCase();
      if (
        normalizedHeading === "a emails" ||
        normalizedHeading === "email" ||
        normalizedHeading === "e-mail" ||
        normalizedHeading === "email address" ||
        normalizedHeading === "work email"
      ) {
        const candidate = normalizeEmail(String(rawValue ?? ""));
        if (candidate && isValidEmailFormat(candidate)) {
          distinctEmails.add(candidate);
        }
      }
    }
  }

  const suppression: SuppressionLookup = new Map();
  for (const email of distinctEmails) {
    const decision = await evaluateSuppression(clientId, email);
    if (decision.suppressed) {
      suppression.set(email, {
        suppressed: true,
        reason: decision.reason,
      });
    }
  }

  const preview = buildCsvImportPreview({
    rows: rawRows,
    existingContacts: existing,
    suppression,
    listTarget: {
      name: resolvedListLabel,
      kind: resolvedListKind,
    },
  });

  return {
    ok: true,
    preview,
    resolvedListLabel,
    resolvedListKind,
    fileName: input.fileName || "upload.csv",
  };
}
