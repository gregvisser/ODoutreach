"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { validateClientBrandInput } from "@/lib/clients/client-brand";
import { prisma } from "@/lib/db";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { requireClientAccess } from "@/server/tenant/access";

const inputSchema = z.object({
  clientId: z.string().min(1),
  logoUrl: z.string().default(""),
  logoAltText: z.string().default(""),
});

/**
 * Update the per-client branding fields (`logoUrl`, `logoAltText`) on
 * the Client record. Gated by OpensDoors staff access + the tenant
 * access gate so operators can only update clients they can already
 * open.
 *
 * Strictly scoped: no mailbox, sequence, contact, suppression, OAuth,
 * or status mutations — only the two branding columns move.
 */
export async function updateClientBrandAction(
  input: z.infer<typeof inputSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const staff = await requireOpensDoorsStaff();
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid branding payload." };
  }

  try {
    await requireClientAccess(staff, parsed.data.clientId);
  } catch {
    return { ok: false, error: "Access denied." };
  }

  const validation = validateClientBrandInput({
    logoUrl: parsed.data.logoUrl,
    logoAltText: parsed.data.logoAltText,
  });
  if (!validation.ok) {
    return { ok: false, error: validation.message };
  }

  await prisma.client.update({
    where: { id: parsed.data.clientId },
    data: {
      logoUrl: validation.normalized.logoUrl,
      logoAltText: validation.normalized.logoAltText,
    },
  });

  await prisma.auditLog.create({
    data: {
      staffUserId: staff.id,
      clientId: parsed.data.clientId,
      action: "UPDATE",
      entityType: "Client",
      entityId: parsed.data.clientId,
      metadata: {
        field: "branding",
        logoUrlSet: validation.normalized.logoUrl !== null,
        logoAltTextSet: validation.normalized.logoAltText !== null,
      },
    },
  });

  revalidatePath(`/clients/${parsed.data.clientId}`);
  revalidatePath(`/clients/${parsed.data.clientId}/brief`);
  revalidatePath("/clients");

  return { ok: true };
}
