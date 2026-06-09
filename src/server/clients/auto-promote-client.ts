import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type { StaffUser } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

import { loadClientLaunchApprovalSnapshot } from "./launch-approval";

export type AutoPromoteResult =
  | { promoted: true; previousStatus: "ONBOARDING" | "PAUSED" }
  | { promoted: false; reason: string };

/**
 * Quietly flip `Client.status` from ONBOARDING → ACTIVE the moment every
 * onboarding section is complete. Replaces the manual "Approve launch"
 * action that required typing a phrase — operators now just complete the
 * sections and the client activates automatically.
 *
 * Designed to be called from page loaders / server actions that touch a
 * client: it's idempotent and a fast no-op when the client is already
 * ACTIVE or has any blocker.
 *
 * Returns `{ promoted: true }` only when this call actually flipped the
 * status, so callers can use it to display a one-time "Client is now
 * active" toast if they want to.
 */
export async function autoPromoteClientIfReady(
  clientId: string,
  staff: Pick<StaffUser, "id" | "role" | "email">,
): Promise<AutoPromoteResult> {
  // PERF: this runs on EVERY client-overview page load. The vast majority
  // of the time the client is already ACTIVE, so do a single cheap status
  // read first and bail before the expensive launch-approval snapshot
  // (which fans out into many queries + a full policy evaluation). Only
  // ONBOARDING clients need that work.
  const statusRow = await prisma.client.findUnique({
    where: { id: clientId },
    select: { status: true },
  });
  if (!statusRow) {
    return { promoted: false, reason: "client_not_found" };
  }
  if (statusRow.status !== "ONBOARDING") {
    return { promoted: false, reason: "not_onboarding" };
  }

  const snapshot = await loadClientLaunchApprovalSnapshot(
    clientId,
    staff,
    // CONTROLLED_INTERNAL keeps one-click-unsubscribe as a warning rather
    // than a hard blocker, matching the existing manual approval mode.
    "CONTROLLED_INTERNAL",
  );
  if (!snapshot) {
    return { promoted: false, reason: "snapshot_unavailable" };
  }

  // Re-check after the snapshot load (defensive — status can't have
  // changed to non-ONBOARDING in this request, but keeps the promote
  // guard explicit).
  if (snapshot.clientStatus !== "ONBOARDING") {
    return { promoted: false, reason: "not_onboarding" };
  }

  // The snapshot already evaluated the policy. Hard blockers gate
  // promotion; warnings don't. The "Client is already ACTIVE" blocker
  // can't fire because we just checked the status above.
  if (snapshot.policy.blockers.length > 0) {
    return { promoted: false, reason: "blockers_present" };
  }

  // Race guard — only flip if the row is still ONBOARDING at write time.
  const now = new Date();
  const updated = await prisma.client.updateMany({
    where: { id: clientId, status: "ONBOARDING" },
    data: {
      status: "ACTIVE",
      launchApprovedAt: now,
      launchApprovedByStaffUserId: staff.id,
      launchApprovalMode: "CONTROLLED_INTERNAL",
      launchApprovalChecklist:
        snapshot.policy.checklist as unknown as Prisma.InputJsonValue,
    },
  });

  if (updated.count === 0) {
    return { promoted: false, reason: "race_lost" };
  }

  await prisma.auditLog.create({
    data: {
      staffUserId: staff.id,
      clientId,
      action: "UPDATE",
      entityType: "Client",
      entityId: clientId,
      metadata: {
        kind: "client_auto_promoted_to_active",
        approvalMode: "CONTROLLED_INTERNAL",
        triggeredBy: staff.email,
      },
    },
  });

  return { promoted: true, previousStatus: "ONBOARDING" };
}
