"use server";

import { revalidatePath } from "next/cache";
import { sequenceRefillRuleInputSchema } from "@/lib/clients/rocketreach-refill-policy";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { previewSequenceListTopUp, saveSequenceListRefillRule } from "@/server/prospect-research/auto-refill";
import { addUniverseMatchesForSequence, previewUniverseMatchesForSequence } from "@/server/prospect-research/universe-harvest";
import { requireClientAccess } from "@/server/tenant/access";

export async function saveSequenceListRefillAction(clientId: string, input: unknown) {
  const staff = await requireOpensDoorsStaff();
  const parsed = sequenceRefillRuleInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Check the top-up settings." };
  }
  try {
    await requireClientAccess(staff, clientId);
  } catch {
    return { ok: false as const, error: "Access denied." };
  }
  const saved = await saveSequenceListRefillRule(staff, clientId, parsed.data);
  if (!saved.ok) return saved;
  revalidatePath(`/clients/${clientId}/outreach`);
  return { ok: true as const };
}

export async function previewSequenceListTopUpAction(clientId: string, sequenceId: string, planId: string) {
  const staff = await requireOpensDoorsStaff();
  try {
    await requireClientAccess(staff, clientId);
  } catch {
    return { ok: false as const, error: "Access denied." };
  }
  const preview = await previewSequenceListTopUp(staff, clientId, sequenceId, planId);
  if (preview.ok) revalidatePath(`/clients/${clientId}/outreach`);
  return preview;
}

export async function previewUniverseMatchesAction(clientId: string, sequenceId: string, planId: string) {
  const staff = await requireOpensDoorsStaff();
  try {
    await requireClientAccess(staff, clientId);
  } catch {
    return { ok: false as const, error: "Access denied." };
  }
  return previewUniverseMatchesForSequence(staff, clientId, sequenceId, planId);
}

export async function addUniverseMatchesAction(clientId: string, sequenceId: string, planId: string) {
  const staff = await requireOpensDoorsStaff();
  try {
    await requireClientAccess(staff, clientId);
  } catch {
    return { ok: false as const, error: "Access denied." };
  }
  const added = await addUniverseMatchesForSequence(staff, clientId, sequenceId, planId);
  if (added.ok) {
    revalidatePath(`/clients/${clientId}/outreach`);
    revalidatePath(`/clients/${clientId}/sources`);
    revalidatePath("/universe");
  }
  return added;
}
