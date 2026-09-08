"use server";
import { z } from "zod";
import { SERVICE_TIERS } from "@/lib/clients/service-tier";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { requireClientAccess } from "@/server/tenant/access";
import { setClientServiceTier } from "@/server/clients/service-tier";
const schema = z.object({ clientId: z.string().min(1).max(100), tier: z.enum(SERVICE_TIERS), expectedRevision: z.number().int().nonnegative() });
export async function setClientServiceTierAction(input: z.infer<typeof schema>) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Choose Maintenance, Growth or Strategic and refresh if the form is out of date." };
  let staff;
  try { staff = await requireOpensDoorsStaff(); await requireClientAccess(staff, parsed.data.clientId); }
  catch { return { ok: false as const, error: "You cannot change this client's grade." }; }
  return setClientServiceTier({ ...parsed.data, staffUserId: staff.id });
}
