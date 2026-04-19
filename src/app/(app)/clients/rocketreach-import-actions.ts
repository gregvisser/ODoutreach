"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { importRocketReachPeopleForClient } from "@/server/integrations/rocketreach/person-import";
import { requireClientAccess } from "@/server/tenant/access";

const manualSchema = z.object({
  clientId: z.string().min(1),
  mode: z.literal("builder"),
  keyword: z.string().optional(),
  companyName: z.string().optional(),
  currentTitle: z.string().optional(),
  location: z.string().optional(),
  pageSize: z.coerce.number().min(1).max(10).optional(),
  orderBy: z.enum(["relevance", "popularity", "score"]).optional(),
});

const rawSchema = z.object({
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
    }
  | { ok: false; error: string };

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
    const result = await importRocketReachPeopleForClient({
      clientId: parsed.data.clientId,
      searchBody: body,
    });
    if (!result.ok) return result;
    revalidatePath(`/clients/${parsed.data.clientId}`);
    revalidatePath("/contacts");
    return {
      ok: true,
      imported: result.imported,
      skippedNoEmail: result.skippedNoEmail,
      skippedInvalid: result.skippedInvalid,
      skippedDuplicate: result.skippedDuplicate,
      errors: result.errors,
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
  });
  if (!result.ok) return result;
  revalidatePath(`/clients/${parsed.data.clientId}`);
  revalidatePath("/contacts");
  return {
    ok: true,
    imported: result.imported,
    skippedNoEmail: result.skippedNoEmail,
    skippedInvalid: result.skippedInvalid,
    skippedDuplicate: result.skippedDuplicate,
    errors: result.errors,
  };
}
