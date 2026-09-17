"use server";

import { revalidatePath } from "next/cache";

import type { SupportTicketPriority } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { isResolutionNoteReady, MIN_RESOLUTION_NOTE_LENGTH } from "@/lib/support/support-labels";
import { resolveSupportTicketWithNotification } from "@/server/support/resolve-support-ticket";
import { retryFailedSupportTicketNotification } from "@/server/support/support-ticket-notifications";
import { requireOpensDoorsStaff } from "@/server/auth/staff";

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

/**
 * Resolve & close a ticket. Owner-only (isSuperAdmin).
 *
 * The flow is deliberately simple: anyone can open a ticket, and the
 * developer/owner fixes it and closes it. There is no separate triage /
 * approve / reject step anymore. Guarded so an already-resolved ticket can't
 * be re-resolved (the previous version had a role check but NO status guard).
 * Accepts any non-resolved status so legacy in-flight tickets remain closable
 * even before the status-folding data migration runs.
 */
export async function resolveSupportTicket(input: {
  ticketId: string;
  resolutionNote: string;
}): Promise<SupportActionResult> {
  const staff = await requireOpensDoorsStaff();
  if (!staff.isSuperAdmin) {
    return { ok: false, error: "Only the owner account can resolve tickets." };
  }
  const existing = await prisma.supportTicket.findUnique({
    where: { id: input.ticketId },
    select: { id: true, status: true },
  });
  if (!existing) return { ok: false, error: "Ticket not found." };
  if (existing.status === "RESOLVED") return { ok: false, error: "This ticket is already resolved." };
  const resolutionNote = input.resolutionNote.trim();
  if (!isResolutionNoteReady(resolutionNote)) {
    return {
      ok: false,
      error: `Explain what was fixed in a bit more detail (at least ${MIN_RESOLUTION_NOTE_LENGTH} characters).`,
    };
  }

  try {
    await resolveSupportTicketWithNotification({ ticketId: input.ticketId, resolutionNote });
  } catch (error) {
    if (error instanceof Error && error.message === "ticket-not-found") return { ok: false, error: "Ticket not found." };
    if (error instanceof Error && error.message === "already-resolved") return { ok: false, error: "This ticket is already resolved." };
    if (error instanceof Error && error.message === "ticket-changed-before-resolution") return { ok: false, error: "The ticket changed before it could be resolved. Refresh and try again." };
    throw error;
  }
  revalidatePath("/support");
  revalidatePath(`/support/${input.ticketId}`);
  return { ok: true };
}

/** Retry a definite provider failure for the current resolution cycle. */
export async function retrySupportTicketNotification(input: {
  ticketId: string;
}): Promise<SupportActionResult> {
  const staff = await requireOpensDoorsStaff();
  if (!staff.isSuperAdmin) return { ok: false, error: "Only the owner account can retry reporter notifications." };
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: input.ticketId },
    select: { id: true, status: true, notifications: { orderBy: { resolutionVersion: "desc" }, take: 1, select: { id: true, status: true } } },
  });
  if (!ticket) return { ok: false, error: "Ticket not found." };
  if (ticket.status !== "RESOLVED" || ticket.notifications[0]?.status !== "FAILED") {
    return { ok: false, error: "Only a definite failed reporter notification can be retried. Unknown provider outcomes require inspection first." };
  }
  const retried = await retryFailedSupportTicketNotification(ticket.notifications[0].id);
  if (!retried) return { ok: false, error: "The notification changed before it could be retried. Refresh and inspect its current state." };
  revalidatePath(`/support/${ticket.id}`);
  return { ok: true };
}

const MIN_COMMENT_LENGTH = 2;

/**
 * Post a reply on a ticket's thread. Any signed-in staff can post — the
 * reporter and the owner already both see every ticket on `/support` today,
 * so this mirrors that existing visibility rather than adding a new
 * restriction. Append-only: there is no edit or delete action.
 */
export async function addSupportTicketComment(input: {
  ticketId: string;
  body: string;
}): Promise<SupportActionResult> {
  const staff = await requireOpensDoorsStaff();

  const body = input.body.trim();
  if (body.length < MIN_COMMENT_LENGTH) {
    return { ok: false, error: "Write something before posting." };
  }

  const ticket = await prisma.supportTicket.findUnique({
    where: { id: input.ticketId },
    select: { id: true },
  });
  if (!ticket) return { ok: false, error: "Ticket not found." };

  await prisma.supportTicketComment.create({
    data: {
      ticketId: ticket.id,
      body,
      authorStaffUserId: staff.id,
      authorEmail: staff.email,
    },
  });

  revalidatePath(`/support/${ticket.id}`);
  return { ok: true };
}

/**
 * Reopen a resolved ticket (owner-only) if it turns out the issue wasn't
 * actually fixed. Clears the resolution so the ticket is a clean OPEN again.
 */
export async function reopenSupportTicket(input: {
  ticketId: string;
}): Promise<SupportActionResult> {
  const staff = await requireOpensDoorsStaff();
  if (!staff.isSuperAdmin) {
    return { ok: false, error: "Only the owner account can reopen tickets." };
  }
  const existing = await prisma.supportTicket.findUnique({
    where: { id: input.ticketId },
    select: { id: true, status: true, resolutionVersion: true },
  });
  if (!existing) return { ok: false, error: "Ticket not found." };
  if (existing.status !== "RESOLVED") {
    return { ok: false, error: "Only a resolved ticket can be reopened." };
  }

  const reopened = await prisma.supportTicket.updateMany({
    where: { id: existing.id, status: "RESOLVED", resolutionVersion: existing.resolutionVersion },
    data: { status: "OPEN", resolvedAt: null, resolutionNote: null, resolutionVersion: { increment: 1 } },
  });
  if (reopened.count !== 1) return { ok: false, error: "The ticket changed before it could be reopened. Refresh and try again." };
  revalidatePath("/support");
  revalidatePath(`/support/${existing.id}`);
  return { ok: true };
}
