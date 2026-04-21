"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { validateNewClientShellInput } from "@/lib/clients/new-client-shell";
import { requireOpensDoorsStaff } from "@/server/auth/staff";

/**
 * PR I — Create a minimal client workspace shell.
 *
 * Writes only identity-level fields (name, slug, industry, website,
 * notes) plus a LEAD `ClientMembership` for the acting staff user. The
 * client stays in `ONBOARDING` until the operator actually completes
 * the workspace modules (Brief, Mailboxes, Suppression, Sources,
 * Contacts, Outreach). We deliberately do NOT:
 *  - flip status to ACTIVE,
 *  - create a `ClientOnboarding` row with faked `completedSteps`,
 *  - accept suppression sheet ids, sender names, daily caps, or
 *    template/sequence configuration. Those belong in per-client
 *    workspace modules so setup progress reflects reality.
 */
export async function createClientFromOnboarding(input: {
  name: string;
  slug: string;
  industry?: string;
  website?: string;
  notes?: string;
}): Promise<
  | { ok: true; clientId: string; slug: string }
  | { ok: false; error: string; reason?: string }
> {
  const staff = await requireOpensDoorsStaff();

  const validation = validateNewClientShellInput(input);
  if (!validation.ok) {
    return { ok: false, error: validation.message, reason: validation.reason };
  }
  const { normalized } = validation;

  const existingSlug = await prisma.client.findUnique({
    where: { slug: normalized.slug },
    select: { id: true },
  });
  if (existingSlug) {
    return {
      ok: false,
      error:
        "That workspace slug is already in use. Choose a different slug (lowercase letters, numbers, hyphens).",
      reason: "SLUG_TAKEN",
    };
  }

  const client = await prisma.client.create({
    data: {
      name: normalized.name,
      slug: normalized.slug,
      industry: normalized.industry,
      website: normalized.website,
      notes: normalized.notes,
      status: "ONBOARDING",
    },
    select: { id: true, slug: true },
  });

  await prisma.clientMembership.create({
    data: {
      staffUserId: staff.id,
      clientId: client.id,
      role: "LEAD",
    },
  });

  await prisma.auditLog.create({
    data: {
      staffUserId: staff.id,
      clientId: client.id,
      action: "CREATE",
      entityType: "Client",
      entityId: client.id,
      metadata: { name: normalized.name, slug: normalized.slug },
    },
  });

  revalidatePath("/clients");
  revalidatePath("/dashboard");

  return { ok: true as const, clientId: client.id, slug: client.slug };
}
