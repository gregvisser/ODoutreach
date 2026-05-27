"use server";

import { revalidatePath } from "next/cache";

import type { SupportTicketPriority } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { isSupportApprover } from "@/server/support/approver";

export type SupportActionResult =
  | { ok: true; ticketId?: string }
  | { ok: false; error: string };

const MAX_ATTACHMENTS = 3;
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024; // 5MB each
const ALLOWED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
]);
const PRIORITIES: SupportTicketPriority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

/** Any signed-in staff can log a ticket, attaching up to 3 screenshots. */
export async function createSupportTicket(
  formData: FormData,
): Promise<SupportActionResult> {
  const staff = await requireOpensDoorsStaff();

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const priorityRaw = String(formData.get("priority") ?? "MEDIUM").toUpperCase();
  const priority = (PRIORITIES as string[]).includes(priorityRaw)
    ? (priorityRaw as SupportTicketPriority)
    : "MEDIUM";

  if (title.length < 3) {
    return { ok: false, error: "Give the ticket a short title (at least 3 characters)." };
  }
  if (description.length < 10) {
    return { ok: false, error: "Describe the issue in a bit more detail (at least 10 characters)." };
  }

  const files = formData
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0)
    .slice(0, MAX_ATTACHMENTS);

  const attachments: {
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    data: Uint8Array<ArrayBuffer>;
  }[] = [];
  for (const file of files) {
    const type = (file.type || "").toLowerCase();
    if (!ALLOWED_IMAGE_TYPES.has(type)) {
      return { ok: false, error: `"${file.name}" isn't a supported image (PNG, JPG, GIF, or WEBP).` };
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      return { ok: false, error: `"${file.name}" is larger than 5MB.` };
    }
    const ab = await file.arrayBuffer();
    const bytes = new Uint8Array(ab.byteLength);
    bytes.set(new Uint8Array(ab));
    attachments.push({
      fileName: file.name || "screenshot",
      mimeType: type,
      sizeBytes: file.size,
      data: bytes,
    });
  }

  const ticket = await prisma.supportTicket.create({
    data: {
      title,
      description,
      priority,
      status: "OPEN",
      reporterEmail: staff.email,
      createdByStaffUserId: staff.id,
      attachments: attachments.length
        ? { create: attachments }
        : undefined,
    },
    select: { id: true },
  });

  revalidatePath("/support");
  return { ok: true, ticketId: ticket.id };
}

/** ADMIN records the developer's proposed fix and moves the ticket forward. */
export async function triageSupportTicket(input: {
  ticketId: string;
  proposedFix: string;
}): Promise<SupportActionResult> {
  const staff = await requireOpensDoorsStaff();
  if (staff.role !== "ADMIN") {
    return { ok: false, error: "Only administrators can triage tickets." };
  }
  const proposedFix = input.proposedFix.trim();
  if (proposedFix.length < 5) {
    return { ok: false, error: "Add a short note describing the proposed fix." };
  }
  const existing = await prisma.supportTicket.findUnique({
    where: { id: input.ticketId },
    select: { id: true, status: true },
  });
  if (!existing) return { ok: false, error: "Ticket not found." };
  if (existing.status === "RESOLVED") {
    return { ok: false, error: "This ticket is already resolved." };
  }

  await prisma.supportTicket.update({
    where: { id: existing.id },
    data: { proposedFix, status: "AWAITING_APPROVAL" },
  });
  revalidatePath("/support");
  revalidatePath(`/support/${existing.id}`);
  return { ok: true };
}

/** Approve or reject a proposed fix — restricted to the configured approver. */
export async function decideSupportTicket(input: {
  ticketId: string;
  decision: "approve" | "reject";
}): Promise<SupportActionResult> {
  const staff = await requireOpensDoorsStaff();
  if (!isSupportApprover(staff.email)) {
    return {
      ok: false,
      error: "Only the authorised approver can approve or reject a fix.",
    };
  }
  const existing = await prisma.supportTicket.findUnique({
    where: { id: input.ticketId },
    select: { id: true, status: true },
  });
  if (!existing) return { ok: false, error: "Ticket not found." };
  if (existing.status !== "AWAITING_APPROVAL") {
    return { ok: false, error: "This ticket is not awaiting approval." };
  }

  await prisma.supportTicket.update({
    where: { id: existing.id },
    data:
      input.decision === "approve"
        ? {
            status: "APPROVED",
            approvedByStaffUserId: staff.id,
            approvedAt: new Date(),
            rejectedAt: null,
          }
        : {
            status: "REJECTED",
            rejectedAt: new Date(),
            approvedByStaffUserId: null,
            approvedAt: null,
          },
  });
  revalidatePath("/support");
  revalidatePath(`/support/${existing.id}`);
  return { ok: true };
}

/** ADMIN closes the ticket once the approved fix is deployed. */
export async function resolveSupportTicket(input: {
  ticketId: string;
  resolutionNote: string;
}): Promise<SupportActionResult> {
  const staff = await requireOpensDoorsStaff();
  if (staff.role !== "ADMIN") {
    return { ok: false, error: "Only administrators can resolve tickets." };
  }
  const existing = await prisma.supportTicket.findUnique({
    where: { id: input.ticketId },
    select: { id: true },
  });
  if (!existing) return { ok: false, error: "Ticket not found." };

  await prisma.supportTicket.update({
    where: { id: existing.id },
    data: {
      status: "RESOLVED",
      resolvedAt: new Date(),
      resolutionNote: input.resolutionNote.trim() || null,
    },
  });
  revalidatePath("/support");
  revalidatePath(`/support/${existing.id}`);
  return { ok: true };
}
