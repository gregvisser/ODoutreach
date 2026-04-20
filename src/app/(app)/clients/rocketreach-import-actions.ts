"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireOpensDoorsStaff } from "@/server/auth/staff";
import {
  resolveImportListForClient,
  resolveImportListTarget,
} from "@/server/contacts/contact-lists";
import { importRocketReachPeopleForClient } from "@/server/integrations/rocketreach/person-import";
import { requireClientAccess } from "@/server/tenant/access";

// PR D2: every import must be routed to a named ContactList. The operator
// either selects an existing client-scoped list or types a new list name.
const listTargetSchema = z.object({
  existingListId: z.string().optional(),
  newListName: z.string().optional(),
});

const manualSchema = listTargetSchema.extend({
  clientId: z.string().min(1),
  mode: z.literal("builder"),
  keyword: z.string().optional(),
  companyName: z.string().optional(),
  currentTitle: z.string().optional(),
  location: z.string().optional(),
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
      errors: string[];
      contactListId: string;
      contactListName: string;
      listAttachedAdded: number;
      listAttachedSkipped: number;
    }
  | { ok: false; error: string };

function listErrorMessage(code: string): string {
  switch (code) {
    case "CONTACT_LIST_NOT_FOUND":
      return "Selected list no longer exists — choose another or type a new name.";
    case "CONTACT_LIST_WRONG_CLIENT":
      return "Selected list belongs to a different client workspace.";
    case "CONTACT_LIST_NAME_REQUIRED":
      return "Enter a list name before importing.";
    case "CONTACT_LIST_NAME_TOO_LONG":
      return "List name must be 120 characters or fewer.";
    default:
      return "Could not resolve the target list.";
  }
}

export async function runRocketReachImportAction(
  input: z.infer<typeof manualSchema> | z.infer<typeof rawSchema>,
): Promise<RocketReachImportActionResult> {
  const staff = await requireOpensDoorsStaff();

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

    const target = resolveImportListTarget({
      existingListId: parsed.data.existingListId,
      newListName: parsed.data.newListName,
    });
    if ("error" in target) {
      return { ok: false, error: target.error };
    }
    let list: { id: string; name: string; clientId: string | null };
    try {
      list = await resolveImportListForClient({
        clientId: parsed.data.clientId,
        target,
        createdByStaffUserId: staff.id,
      });
    } catch (e) {
      const code = e instanceof Error ? e.message : String(e);
      return { ok: false, error: listErrorMessage(code) };
    }

    const result = await importRocketReachPeopleForClient({
      clientId: parsed.data.clientId,
      searchBody: body,
      contactListId: list.id,
      addedByStaffUserId: staff.id,
    });
    if (!result.ok) return result;
    revalidatePath(`/clients/${parsed.data.clientId}`);
    revalidatePath(`/clients/${parsed.data.clientId}/sources`);
    revalidatePath("/contacts");
    return {
      ok: true,
      imported: result.imported,
      skippedNoEmail: result.skippedNoEmail,
      skippedInvalid: result.skippedInvalid,
      skippedDuplicate: result.skippedDuplicate,
      errors: result.errors,
      contactListId: result.contactListId,
      contactListName: list.name,
      listAttachedAdded: result.listAttachedAdded,
      listAttachedSkipped: result.listAttachedSkipped,
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

  const q: Record<string, string[]> = {};
  const k = parsed.data.keyword?.trim();
  const co = parsed.data.companyName?.trim();
  const ti = parsed.data.currentTitle?.trim();
  const loc = parsed.data.location?.trim();
  if (k) q.keyword = [k];
  if (co) q.company_name = [co];
  if (ti) q.current_title = [ti];
  if (loc) q.location = [loc];

  if (Object.keys(q).length === 0) {
    return {
      ok: false,
      error:
        "Enter at least one of keyword, company, title, or location — or use raw JSON mode.",
    };
  }

  const target = resolveImportListTarget({
    existingListId: parsed.data.existingListId,
    newListName: parsed.data.newListName,
  });
  if ("error" in target) {
    return { ok: false, error: target.error };
  }
  let list: { id: string; name: string; clientId: string | null };
  try {
    list = await resolveImportListForClient({
      clientId: parsed.data.clientId,
      target,
      createdByStaffUserId: staff.id,
    });
  } catch (e) {
    const code = e instanceof Error ? e.message : String(e);
    return { ok: false, error: listErrorMessage(code) };
  }

  const pageSize = parsed.data.pageSize ?? 10;
  const searchBody: Record<string, unknown> = {
    query: q,
    page_size: pageSize,
    start: 1,
    order_by: parsed.data.orderBy ?? "relevance",
  };

  const result = await importRocketReachPeopleForClient({
    clientId: parsed.data.clientId,
    searchBody,
    contactListId: list.id,
    addedByStaffUserId: staff.id,
  });
  if (!result.ok) return result;
  revalidatePath(`/clients/${parsed.data.clientId}`);
  revalidatePath(`/clients/${parsed.data.clientId}/sources`);
  revalidatePath("/contacts");
  return {
    ok: true,
    imported: result.imported,
    skippedNoEmail: result.skippedNoEmail,
    skippedInvalid: result.skippedInvalid,
    skippedDuplicate: result.skippedDuplicate,
    errors: result.errors,
    contactListId: result.contactListId,
    contactListName: list.name,
    listAttachedAdded: result.listAttachedAdded,
    listAttachedSkipped: result.listAttachedSkipped,
  };
}
