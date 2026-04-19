"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import {
  mergeBriefIntoFormData,
  opensDoorsBriefFieldsSchema,
} from "@/lib/opensdoors-brief";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { requireClientAccess } from "@/server/tenant/access";

const updateSchema = z.object({
  clientId: z.string().min(1),
  brief: opensDoorsBriefFieldsSchema,
});

export async function updateOpensDoorsBriefAction(
  input: z.infer<typeof updateSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const staff = await requireOpensDoorsStaff();
  const data = updateSchema.safeParse(input);
  if (!data.success) {
    return { ok: false, error: "Invalid brief payload." };
  }
  try {
    await requireClientAccess(staff, data.data.clientId);
  } catch {
    return { ok: false, error: "Access denied." };
  }

  const existing = await prisma.clientOnboarding.findUnique({
    where: { clientId: data.data.clientId },
  });

  const merged = mergeBriefIntoFormData(
    existing?.formData ?? {},
    data.data.brief,
  ) as Prisma.InputJsonValue;

  if (existing) {
    await prisma.clientOnboarding.update({
      where: { clientId: data.data.clientId },
      data: { formData: merged },
    });
  } else {
    await prisma.clientOnboarding.create({
      data: {
        clientId: data.data.clientId,
        currentStep: 1,
        completedSteps: [],
        formData: merged,
      },
    });
  }

  revalidatePath(`/clients/${data.data.clientId}`);
  return { ok: true };
}
