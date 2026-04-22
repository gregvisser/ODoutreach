"use server";

import { revalidatePath } from "next/cache";

import type { ClientLaunchApprovalMode } from "@/lib/clients/client-launch-approval";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import {
  approveClientLaunch,
  type ApproveClientLaunchResult,
} from "@/server/clients/launch-approval";

export type ApproveClientLaunchActionInput = {
  clientId: string;
  mode: ClientLaunchApprovalMode;
  confirmationPhrase: string;
  notes?: string;
};

/**
 * PR K — Server action wrapper around {@link approveClientLaunch}.
 *
 * Revalidates the client workspace overview so the new ACTIVE status,
 * approval metadata, and launch-approval card copy flip immediately.
 * No sends/imports/syncs are triggered.
 */
export async function approveClientLaunchAction(
  input: ApproveClientLaunchActionInput,
): Promise<ApproveClientLaunchResult> {
  const staff = await requireOpensDoorsStaff();

  const result = await approveClientLaunch({
    staff,
    clientId: input.clientId,
    mode: input.mode,
    confirmationPhrase: input.confirmationPhrase,
    notes: input.notes,
  });

  if (result.ok) {
    revalidatePath(`/clients/${input.clientId}`);
    revalidatePath("/clients");
    revalidatePath("/dashboard");
  }

  return result;
}
