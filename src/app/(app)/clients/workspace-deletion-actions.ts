"use server";

import { revalidatePath } from "next/cache";

import { requireSuperAdminForAction } from "@/server/auth/staff";
import {
  restoreClientWorkspace,
  softDeleteClientWorkspace,
  type WorkspaceDeletionResult,
} from "@/server/clients/workspace-deletion";

/**
 * F2 — super-admin server actions for workspace soft-delete / restore.
 *
 * Both re-establish the super-admin gate server-side (never trust the client),
 * map an unauthorised caller to a clean `forbidden` result instead of throwing,
 * and revalidate the lists that hide/show the workspace. Neither touches any
 * email, sequence, or suppression data — that is the core's contract.
 */

async function denyResult(): Promise<WorkspaceDeletionResult> {
  return {
    ok: false,
    reason: "forbidden",
    message: "You do not have permission to delete workspaces.",
  };
}

export async function softDeleteWorkspaceAction(input: {
  clientId: string;
  typedConfirmation: string;
}): Promise<WorkspaceDeletionResult> {
  let staff;
  try {
    staff = await requireSuperAdminForAction();
  } catch {
    return denyResult();
  }

  const res = await softDeleteClientWorkspace({
    actor: { id: staff.id, isSuperAdmin: staff.isSuperAdmin },
    clientId: input.clientId,
    typedConfirmation: input.typedConfirmation,
  });

  if (res.ok) {
    revalidatePath("/clients");
    revalidatePath("/settings/deleted-workspaces");
  }
  return res;
}

export async function restoreWorkspaceAction(input: {
  clientId: string;
}): Promise<WorkspaceDeletionResult> {
  let staff;
  try {
    staff = await requireSuperAdminForAction();
  } catch {
    return denyResult();
  }

  const res = await restoreClientWorkspace({
    actor: { id: staff.id, isSuperAdmin: staff.isSuperAdmin },
    clientId: input.clientId,
  });

  if (res.ok) {
    revalidatePath("/clients");
    revalidatePath("/settings/deleted-workspaces");
  }
  return res;
}
