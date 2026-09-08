"use server";
import { z } from "zod";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { requireClientAccess } from "@/server/tenant/access";
import { approveHeldEmail } from "@/server/email/outbound/staff-review";

const schema = z.object({ clientId: z.string().min(1).max(100), outboundEmailId: z.string().min(1).max(100), reviewToken: z.string().regex(/^[a-f0-9]{64}$/) });
export async function approveHeldEmailAction(input: z.infer<typeof schema>) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "This review is incomplete. Refresh the page." };
  let staff;
  try { staff = await requireOpensDoorsStaff(); await requireClientAccess(staff, parsed.data.clientId); }
  catch { return { ok: false as const, error: "You cannot review this client's emails." }; }
  return approveHeldEmail({ ...parsed.data, staffUserId: staff.id });
}
