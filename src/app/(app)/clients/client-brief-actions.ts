"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { mergeBriefIntoFormData, opensDoorsBriefFieldsSchema } from "@/lib/opensdoors-brief";
import { normalizeTaxonomyLabel } from "@/lib/brief/brief-taxonomy";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { requireClientAccess } from "@/server/tenant/access";

const MAX_PDF_BYTES = 5 * 1024 * 1024;

const businessBriefSchema = z
  .object({
    tradingName: z.string().optional(),
    businessAddress: z.string().optional(),
    targetGeography: z.string().optional(),
    targetCustomerProfile: z.string().optional(),
    usps: z.string().optional(),
    offer: z.string().optional(),
    exclusions: z.string().optional(),
    complianceNotes: z.string().optional(),
    campaignObjective: z.string().optional(),
    valueProposition: z.string().optional(),
    coreOffer: z.string().optional(),
    differentiators: z.string().optional(),
    proofNotes: z.string().optional(),
  })
  .strict();

const addressJsonSchema = z
  .object({
    line1: z.string().optional(),
    line2: z.string().optional(),
    city: z.string().optional(),
    region: z.string().optional(),
    postalCode: z.string().optional(),
    country: z.string().optional(),
    formattedSummary: z.string().optional(),
  })
  .strict()
  .optional()
  .nullable();

const mainContactJsonSchema = z
  .object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    role: z.string().optional(),
    email: z.string().optional(),
    mobile: z.string().optional(),
    status: z.string().optional(),
  })
  .strict()
  .optional()
  .nullable();

const saveSchema = z.object({
  clientId: z.string().min(1),
  website: z.string().optional().default(""),
  industry: z.string().optional().default(""),
  briefLinkedinUrl: z.string().optional().default(""),
  briefInternalNotes: z.string().max(30_000).optional().default(""),
  briefAssignedAccountManagerId: z.string().nullable().optional(),
  briefBusinessAddress: addressJsonSchema,
  briefMainContact: mainContactJsonSchema,
  brief: businessBriefSchema,
  taxonomy: z.object({
    SERVICE_AREA: z.array(z.string()),
    TARGET_INDUSTRY: z.array(z.string()),
    COMPANY_SIZE: z.array(z.string()),
    JOB_TITLE: z.array(z.string()),
  }),
});

export async function saveClientBriefAction(
  input: z.infer<typeof saveSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const staff = await requireOpensDoorsStaff();
  const data = saveSchema.safeParse(input);
  if (!data.success) {
    return { ok: false, error: "Invalid brief data." };
  }
  try {
    await requireClientAccess(staff, data.data.clientId);
  } catch {
    return { ok: false, error: "Access denied." };
  }

  if (data.data.briefAssignedAccountManagerId) {
    const m = await prisma.staffUser.findFirst({
      where: { id: data.data.briefAssignedAccountManagerId, isActive: true },
      select: { id: true },
    });
    if (!m) {
      return { ok: false, error: "Invalid account manager." };
    }
  }

  const clientPatch = {
    website: data.data.website.trim() || null,
    industry: data.data.industry.trim() || null,
    briefLinkedinUrl: data.data.briefLinkedinUrl.trim() || null,
    briefInternalNotes: data.data.briefInternalNotes.trim() || null,
    briefBusinessAddress: data.data.briefBusinessAddress as Prisma.InputJsonValue,
    briefMainContact: data.data.briefMainContact as Prisma.InputJsonValue,
    briefAssignedAccountManagerId: data.data.briefAssignedAccountManagerId || null,
  };

  const briefForMerge = data.data.brief;
  const compact: Record<string, string> = {};
  for (const [k, v] of Object.entries(briefForMerge)) {
    if (typeof v === "string") compact[k] = v;
  }

  const existing = await prisma.clientOnboarding.findUnique({
    where: { clientId: data.data.clientId },
  });
  const merged = mergeBriefIntoFormData(
    existing?.formData ?? {},
    compact as z.infer<typeof opensDoorsBriefFieldsSchema>,
  ) as Prisma.InputJsonValue;

  const clientId = data.data.clientId;
  const tax = data.data.taxonomy;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.client.update({
        where: { id: clientId },
        data: clientPatch,
      });

      if (existing) {
        await tx.clientOnboarding.update({
          where: { clientId },
          data: { formData: merged },
        });
      } else {
        await tx.clientOnboarding.create({
          data: {
            clientId,
            currentStep: 1,
            completedSteps: [],
            formData: merged,
          },
        });
      }

      await tx.clientBriefTermLink.deleteMany({ where: { clientId } });

      const kinds = [
        "SERVICE_AREA",
        "TARGET_INDUSTRY",
        "COMPANY_SIZE",
        "JOB_TITLE",
      ] as const;
      for (const kind of kinds) {
        const labels = tax[kind] ?? [];
        const seen = new Set<string>();
        for (const label of labels) {
          const { key, display } = normalizeTaxonomyLabel(label);
          if (!display || seen.has(key)) continue;
          seen.add(key);
          const term = await tx.briefTaxonomyTerm.upsert({
            where: {
              kind_normalizedValue: { kind, normalizedValue: key },
            },
            create: {
              kind,
              normalizedValue: key,
              displayValue: display,
              firstUsedByClientId: clientId,
            },
            update: {},
          });
          await tx.clientBriefTermLink.create({
            data: { clientId, termId: term.id },
          });
        }
      }
    });
  } catch (e) {
    console.error(e);
    return { ok: false, error: "Could not save brief." };
  }

  revalidatePath(`/clients/${clientId}`);
  revalidatePath(`/clients/${clientId}/brief`);
  revalidatePath("/clients");
  return { ok: true };
}

const taxonomyKindSchema = z.enum([
  "SERVICE_AREA",
  "TARGET_INDUSTRY",
  "COMPANY_SIZE",
  "JOB_TITLE",
]);

const searchTaxSchema = z.object({
  kind: taxonomyKindSchema,
  q: z.string().max(200),
});

export async function searchBriefTaxonomyAction(
  input: z.infer<typeof searchTaxSchema>,
): Promise<{ ok: true; terms: { id: string; displayValue: string }[] } | { ok: false; error: string }> {
  await requireOpensDoorsStaff();
  const p = searchTaxSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "Invalid search." };
  const q = p.data.q.trim();
  if (q.length < 1) return { ok: true, terms: [] };
  const terms = await prisma.briefTaxonomyTerm.findMany({
    where: {
      kind: p.data.kind,
      displayValue: { contains: q, mode: "insensitive" },
    },
    take: 25,
    orderBy: { displayValue: "asc" },
    select: { id: true, displayValue: true },
  });
  return { ok: true, terms };
}

export async function deleteComplianceAttachmentAction(
  input: { clientId: string; attachmentId: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const staff = await requireOpensDoorsStaff();
  if (!input.clientId || !input.attachmentId) {
    return { ok: false, error: "Invalid request." };
  }
  try {
    await requireClientAccess(staff, input.clientId);
  } catch {
    return { ok: false, error: "Access denied." };
  }
  const row = await prisma.clientComplianceAttachment.findFirst({
    where: { id: input.attachmentId, clientId: input.clientId },
  });
  if (!row) return { ok: false, error: "Not found." };
  await prisma.clientComplianceAttachment.delete({ where: { id: row.id } });
  revalidatePath(`/clients/${input.clientId}/brief`);
  return { ok: true };
}

export async function uploadCompliancePdfAction(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const staff = await requireOpensDoorsStaff();
  const clientId = String(formData.get("clientId") ?? "");
  const file = formData.get("file");
  if (!clientId || !(file instanceof File) || file.size < 1) {
    return { ok: false, error: "Choose a PDF to upload." };
  }
  try {
    await requireClientAccess(staff, clientId);
  } catch {
    return { ok: false, error: "Access denied." };
  }
  const type = (file.type || "").toLowerCase();
  if (type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return { ok: false, error: "Only PDF files are supported." };
  }
  if (file.size > MAX_PDF_BYTES) {
    return { ok: false, error: "PDF must be 5MB or smaller." };
  }
  const buf = Buffer.from(await file.arrayBuffer());
  await prisma.clientComplianceAttachment.create({
    data: {
      clientId,
      fileName: file.name || "compliance.pdf",
      mimeType: "application/pdf",
      sizeBytes: buf.length,
      data: buf,
      uploadedByStaffUserId: staff.id,
    },
  });
  revalidatePath(`/clients/${clientId}/brief`);
  return { ok: true };
}
