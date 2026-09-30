"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isRocketReachIndustry } from "@/lib/clients/rocketreach-industries";
import { buildRocketReachCardQuery } from "@/lib/clients/rocketreach-search-query";

import { requireOpensDoorsStaff } from "@/server/auth/staff";
import {
  ROCKETREACH_IMPORT_CONFIRMATION_PHRASE,
  isRocketReachImportConfirmationValid,
} from "@/lib/clients/rocketreach-import-safety";
import { runRocketReachListImport } from "@/server/integrations/rocketreach/run-import";
import { requireClientAccess } from "@/server/tenant/access";

// PR D2: every import must be routed to a named ContactList. The operator
// either selects an existing client-scoped list or types a new list name.
const listTargetSchema = z.object({
  existingListId: z.string().optional(),
  newListName: z.string().optional(),
  confirmationPhrase: z.string().optional(),
});

const manualSchema = listTargetSchema.extend({
  clientId: z.string().min(1),
  mode: z.literal("builder"),
  keyword: z.string().optional(),
  companyName: z.string().optional(),
  currentTitle: z.string().optional(),
  location: z.string().optional(),
  industry: z.string().trim().max(200).refine(value => !value || isRocketReachIndustry(value)).optional(),
  pageSize: z.coerce.number().min(1).max(10).optional(),
  orderBy: z.enum(["relevance", "popularity", "score"]).optional(),
});

const rawSchema = listTargetSchema.extend({
  clientId: z.string().min(1),
  mode: z.literal("raw"),
  rawJson: z.string().min(2),
});

export type RocketReachImportActionResult =
  | {
      ok: true;
      imported: number;
      skippedNoEmail: number;
      skippedInvalid: number;
      skippedDuplicate: number;
      skippedAlreadyKnown: number;
      creditsUsed: number;
      errors: string[];
      contactListId: string;
      contactListName: string;
      listAttachedAdded: number;
      listAttachedSkipped: number;
      universeCreated: number;
      universeMatched: number;
    }
  | { ok: false; error: string };

function revalidateImport(clientId: string) {
  revalidatePath(`/clients/${clientId}`);
  revalidatePath(`/clients/${clientId}/sources`);
  revalidatePath("/contacts");
  revalidatePath("/universe");
}

export async function runRocketReachImportAction(
  input: z.infer<typeof manualSchema> | z.infer<typeof rawSchema>,
): Promise<RocketReachImportActionResult> {
  const staff = await requireOpensDoorsStaff();
  if (!isRocketReachImportConfirmationValid(input.confirmationPhrase ?? "")) {
    return {
      ok: false,
      error: `Type ${ROCKETREACH_IMPORT_CONFIRMATION_PHRASE} before searching RocketReach. This uses live RocketReach credits and may write contacts.`,
    };
  }

  if (input.mode === "raw") {
    const parsed = rawSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: "Invalid raw JSON." };
    }
    try {
      await requireClientAccess(staff, parsed.data.clientId);
    } catch {
      return { ok: false, error: "Access denied." };
    }
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(parsed.data.rawJson) as Record<string, unknown>;
    } catch {
      return { ok: false, error: "JSON parse error — check the request body." };
    }
    if (!body.query || typeof body.query !== "object") {
      return {
        ok: false,
        error: 'Raw mode JSON must include a "query" object (RocketReach People Search API).',
      };
    }

    const result = await runRocketReachListImport({
      clientId: parsed.data.clientId,
      staffId: staff.id,
      existingListId: parsed.data.existingListId,
      newListName: parsed.data.newListName,
      searchBody: body,
    });
    if (!result.ok) return result;
    revalidateImport(parsed.data.clientId);
    return {
      ok: true,
      imported: result.imported,
      skippedNoEmail: result.skippedNoEmail,
      skippedInvalid: result.skippedInvalid,
      skippedDuplicate: result.skippedDuplicate,
      skippedAlreadyKnown: result.skippedAlreadyKnown,
      creditsUsed: result.creditsUsed,
      errors: result.errors,
      contactListId: result.contactListId,
      contactListName: result.contactListName,
      listAttachedAdded: result.listAttachedAdded,
      listAttachedSkipped: result.listAttachedSkipped,
      universeCreated: result.universeCreated,
      universeMatched: result.universeMatched,
    };
  }

  const parsed = manualSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid search fields." };
  }
  try {
    await requireClientAccess(staff, parsed.data.clientId);
  } catch {
    return { ok: false, error: "Access denied." };
  }

  const q = buildRocketReachCardQuery({
    keyword: parsed.data.keyword ? [parsed.data.keyword] : undefined,
    companyName: parsed.data.companyName ? [parsed.data.companyName] : undefined,
    currentTitle: parsed.data.currentTitle ? [parsed.data.currentTitle] : undefined,
    location: parsed.data.location ? [parsed.data.location] : undefined,
    industry: parsed.data.industry ? [parsed.data.industry] : undefined,
  });

  if (Object.keys(q).length === 0) {
    return {
      ok: false,
      error:
        "Enter at least one keyword, company, title, location, or industry.",
    };
  }

  const pageSize = parsed.data.pageSize ?? 10;
  const searchBody: Record<string, unknown> = {
    query: q,
    page_size: pageSize,
    start: 1,
    order_by: parsed.data.orderBy ?? "relevance",
  };

  const result = await runRocketReachListImport({
    clientId: parsed.data.clientId,
    staffId: staff.id,
    existingListId: parsed.data.existingListId,
    newListName: parsed.data.newListName,
    searchBody,
  });
  if (!result.ok) return result;
  revalidateImport(parsed.data.clientId);
  return {
    ok: true,
    imported: result.imported,
    skippedNoEmail: result.skippedNoEmail,
    skippedInvalid: result.skippedInvalid,
    skippedDuplicate: result.skippedDuplicate,
    skippedAlreadyKnown: result.skippedAlreadyKnown,
    creditsUsed: result.creditsUsed,
    errors: result.errors,
    contactListId: result.contactListId,
    contactListName: result.contactListName,
    listAttachedAdded: result.listAttachedAdded,
    listAttachedSkipped: result.listAttachedSkipped,
    universeCreated: result.universeCreated,
    universeMatched: result.universeMatched,
  };
}
