"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireOpensDoorsStaff } from "@/server/auth/staff";

const onboardSchema = z.object({
  name: z.string().min(2),
  slug: z
    .string()
    .min(2)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens"),
  industry: z.string().optional(),
  website: z
    .string()
    .optional()
    .refine((val) => !val || /^https?:\/\/.+/.test(val), "Enter a valid URL or leave blank"),
  notes: z.string().optional(),
  emailSheetId: z.string().optional(),
  domainSheetId: z.string().optional(),
  senderName: z.string().optional(),
  dailyCap: z.coerce.number().min(1).max(5000).optional(),
});

export async function createClientFromOnboarding(
  input: z.infer<typeof onboardSchema>,
) {
  const staff = await requireOpensDoorsStaff();
  const data = onboardSchema.parse(input);

  const client = await prisma.client.create({
    data: {
      name: data.name,
      slug: data.slug,
      industry: data.industry || null,
      website: data.website || null,
      notes: data.notes || null,
      status: "ONBOARDING",
    },
  });

  await prisma.clientMembership.create({
    data: {
      staffUserId: staff.id,
      clientId: client.id,
      role: "LEAD",
    },
  });

  await prisma.clientOnboarding.create({
    data: {
      clientId: client.id,
      currentStep: 4,
      completedSteps: [1, 2, 3, 4],
      completedAt: new Date(),
      formData: {
        emailSheetId: data.emailSheetId,
        domainSheetId: data.domainSheetId,
        senderName: data.senderName,
        dailyCap: data.dailyCap,
      },
    },
  });

  if (data.emailSheetId) {
    await prisma.suppressionSource.create({
      data: {
        clientId: client.id,
        kind: "EMAIL",
        spreadsheetId: data.emailSheetId,
        label: "Imported email suppression",
        syncStatus: "NOT_CONFIGURED",
      },
    });
  }

  if (data.domainSheetId) {
    await prisma.suppressionSource.create({
      data: {
        clientId: client.id,
        kind: "DOMAIN",
        spreadsheetId: data.domainSheetId,
        label: "Imported domain suppression",
        syncStatus: "NOT_CONFIGURED",
      },
    });
  }

  await prisma.client.update({
    where: { id: client.id },
    data: { status: "ACTIVE" },
  });

  await prisma.auditLog.create({
    data: {
      staffUserId: staff.id,
      clientId: client.id,
      action: "CREATE",
      entityType: "Client",
      entityId: client.id,
      metadata: { name: data.name },
    },
  });

  revalidatePath("/clients");
  revalidatePath("/dashboard");
  return { ok: true as const, clientId: client.id };
}
