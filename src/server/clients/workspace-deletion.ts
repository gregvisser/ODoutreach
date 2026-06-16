import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { canDeleteWorkspace } from "@/server/tenant/access";
import { workspaceDeletionConfirmationMatches } from "@/lib/clients/workspace-deletion-confirm";

/**
 * F2 — workspace soft-delete + restore.
 *
 * Design constraints (these are deliberate, not incidental):
 *  - Soft-delete sets `Client.deletedAt` ONLY. It never touches a single
 *    email, sequence, enrolment, suppression or mailbox row. Those stay exactly
 *    as they were, so a restore is a perfect undo and nothing "live" is altered.
 *  - Soft-deleted workspaces are hidden from every normal read path and the
 *    send pipeline skips them (read-side) — see `getAccessibleClientIds`,
 *    `listClientsForStaff`, the outbound queue claim, and `advance-due-followups`.
 *  - Permanent destruction (which DOES delete sacrosanct suppression/DNC data)
 *    is a SEPARATE, deliberate hard purge — never wired into this flow.
 *  - Authorisation is the per-account super-admin capability, re-checked here
 *    defensively even though callers also gate at the action boundary.
 */

type Actor = { id: string; isSuperAdmin: boolean };

export type WorkspaceDeletionResult =
  | { ok: true; clientName: string }
  | {
      ok: false;
      reason:
        | "forbidden"
        | "not_found"
        | "already_deleted"
        | "not_deleted"
        | "name_mismatch";
      message: string;
    };

async function writeWorkspaceAudit(
  tx: Prisma.TransactionClient,
  input: {
    actorStaffUserId: string;
    clientId: string;
    action: "DELETE" | "UPDATE";
    metadata: Prisma.InputJsonValue;
  },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      staffUserId: input.actorStaffUserId,
      clientId: input.clientId,
      action: input.action,
      entityType: "Client",
      entityId: input.clientId,
      metadata: input.metadata,
    },
  });
}

/**
 * Soft-delete a workspace. Requires the exact typed workspace name as a
 * deliberate confirmation. Idempotent-safe: a concurrent double-delete loses
 * the race cleanly and reports `already_deleted`.
 */
export async function softDeleteClientWorkspace(input: {
  actor: Actor;
  clientId: string;
  typedConfirmation: string;
}): Promise<WorkspaceDeletionResult> {
  if (!canDeleteWorkspace(input.actor)) {
    return { ok: false, reason: "forbidden", message: "Not permitted." };
  }

  const client = await prisma.client.findUnique({
    where: { id: input.clientId },
    select: { id: true, name: true, deletedAt: true },
  });
  if (!client) {
    return { ok: false, reason: "not_found", message: "Workspace not found." };
  }
  if (client.deletedAt) {
    return {
      ok: false,
      reason: "already_deleted",
      message: "Workspace is already deleted.",
    };
  }
  if (
    !workspaceDeletionConfirmationMatches(input.typedConfirmation, client.name)
  ) {
    return {
      ok: false,
      reason: "name_mismatch",
      message: "The typed name does not match the workspace name.",
    };
  }

  const now = new Date();
  const done = await prisma.$transaction(async (tx) => {
    // Guarded update — only flips a row that is still un-deleted (atomic vs races).
    const updated = await tx.client.updateMany({
      where: { id: client.id, deletedAt: null },
      data: { deletedAt: now, deletedByStaffUserId: input.actor.id },
    });
    if (updated.count !== 1) return false;
    await writeWorkspaceAudit(tx, {
      actorStaffUserId: input.actor.id,
      clientId: client.id,
      action: "DELETE",
      metadata: {
        kind: "workspace_soft_delete",
        workspaceName: client.name,
        deletedAt: now.toISOString(),
      },
    });
    return true;
  });

  if (!done) {
    return {
      ok: false,
      reason: "already_deleted",
      message: "Workspace is already deleted.",
    };
  }
  return { ok: true, clientName: client.name };
}

/**
 * Restore a soft-deleted workspace (clears the delete marker). Available to a
 * super-admin during the recovery window; the underlying data was never
 * touched, so this is a complete undo.
 */
export async function restoreClientWorkspace(input: {
  actor: Actor;
  clientId: string;
}): Promise<WorkspaceDeletionResult> {
  if (!canDeleteWorkspace(input.actor)) {
    return { ok: false, reason: "forbidden", message: "Not permitted." };
  }

  const client = await prisma.client.findUnique({
    where: { id: input.clientId },
    select: { id: true, name: true, deletedAt: true },
  });
  if (!client) {
    return { ok: false, reason: "not_found", message: "Workspace not found." };
  }
  if (!client.deletedAt) {
    return {
      ok: false,
      reason: "not_deleted",
      message: "Workspace is not deleted.",
    };
  }

  const done = await prisma.$transaction(async (tx) => {
    const updated = await tx.client.updateMany({
      where: { id: client.id, deletedAt: { not: null } },
      data: { deletedAt: null, deletedByStaffUserId: null },
    });
    if (updated.count !== 1) return false;
    await writeWorkspaceAudit(tx, {
      actorStaffUserId: input.actor.id,
      clientId: client.id,
      action: "UPDATE",
      metadata: {
        kind: "workspace_restore",
        workspaceName: client.name,
      },
    });
    return true;
  });

  if (!done) {
    return {
      ok: false,
      reason: "not_deleted",
      message: "Workspace is not deleted.",
    };
  }
  return { ok: true, clientName: client.name };
}
