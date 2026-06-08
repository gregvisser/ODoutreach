"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { getClientEmailSequenceMutationAllowed } from "@/server/email-sequences/mutator-access";
import { requireClientAccess } from "@/server/tenant/access";

/**
 * PR #137 — staff-safe enrolment lifecycle actions invoked from the
 * linked reply detail page.
 *
 * Hard constraints:
 *   * No email is sent. No provider call. No queue work.
 *   * Staff access to the client is re-verified on every call.
 *   * Enrolment must belong to the same client.
 *   * EXCLUDED is never overwritten (operator suppression is sticky).
 *   * "Resume" is intentionally NOT implemented in PR #137: re-activating
 *     an enrolment whose follow-up delay already elapsed would cause the
 *     dispatcher to send immediately on the next plan-and-drain. Tracked
 *     in `docs/ops/SYSTEM_HANDOVER_GAPS.md` as a deferred item.
 */

export type EnrollmentActionResult =
  | { ok: true; status: "COMPLETED" | "PAUSED" }
  | { ok: false; reason: string };

async function loadEnrollmentForClient(args: {
  clientId: string;
  enrollmentId: string;
}): Promise<{ id: string; status: string } | null> {
  const row = await prisma.clientEmailSequenceEnrollment.findFirst({
    where: { id: args.enrollmentId, clientId: args.clientId },
    select: { id: true, status: true },
  });
  return row;
}

export async function markEnrollmentCompletedAction(input: {
  clientId: string;
  enrollmentId: string;
  replyId: string;
}): Promise<EnrollmentActionResult> {
  const staff = await requireOpensDoorsStaff();
  await requireClientAccess(staff, input.clientId);

  // Read-only roles (global VIEWER, client-level VIEWER) may open the
  // reply but must not change enrolment lifecycle. Same predicate that
  // gates sequence/template mutation, so the permission model stays
  // consistent across the workspace.
  if (!(await getClientEmailSequenceMutationAllowed(staff, input.clientId))) {
    return {
      ok: false,
      reason: "You do not have permission to change enrolments for this client.",
    };
  }

  const enrolment = await loadEnrollmentForClient({
    clientId: input.clientId,
    enrollmentId: input.enrollmentId,
  });
  if (!enrolment) return { ok: false, reason: "Enrolment not found." };
  if (enrolment.status === "EXCLUDED") {
    return {
      ok: false,
      reason: "Enrolment is EXCLUDED — operator must lift exclusion first.",
    };
  }
  if (enrolment.status === "COMPLETED") {
    revalidatePath(
      `/clients/${input.clientId}/activity/replies/${input.replyId}`,
    );
    return { ok: true, status: "COMPLETED" };
  }

  await prisma.clientEmailSequenceEnrollment.update({
    where: { id: enrolment.id },
    data: { status: "COMPLETED", completedAt: new Date() },
  });

  revalidatePath(`/clients/${input.clientId}/activity/replies/${input.replyId}`);
  revalidatePath(`/clients/${input.clientId}/activity`);
  return { ok: true, status: "COMPLETED" };
}

export async function pauseEnrollmentAction(input: {
  clientId: string;
  enrollmentId: string;
  replyId: string;
}): Promise<EnrollmentActionResult> {
  const staff = await requireOpensDoorsStaff();
  await requireClientAccess(staff, input.clientId);

  if (!(await getClientEmailSequenceMutationAllowed(staff, input.clientId))) {
    return {
      ok: false,
      reason: "You do not have permission to change enrolments for this client.",
    };
  }

  const enrolment = await loadEnrollmentForClient({
    clientId: input.clientId,
    enrollmentId: input.enrollmentId,
  });
  if (!enrolment) return { ok: false, reason: "Enrolment not found." };
  if (enrolment.status === "EXCLUDED") {
    return {
      ok: false,
      reason: "Enrolment is EXCLUDED — operator must lift exclusion first.",
    };
  }
  if (enrolment.status === "COMPLETED") {
    return {
      ok: false,
      reason:
        "Enrolment is already COMPLETED — pausing a completed enrolment is a no-op.",
    };
  }
  if (enrolment.status === "PAUSED") {
    revalidatePath(
      `/clients/${input.clientId}/activity/replies/${input.replyId}`,
    );
    return { ok: true, status: "PAUSED" };
  }

  await prisma.clientEmailSequenceEnrollment.update({
    where: { id: enrolment.id },
    data: { status: "PAUSED", pausedAt: new Date() },
  });

  revalidatePath(`/clients/${input.clientId}/activity/replies/${input.replyId}`);
  revalidatePath(`/clients/${input.clientId}/activity`);
  return { ok: true, status: "PAUSED" };
}
