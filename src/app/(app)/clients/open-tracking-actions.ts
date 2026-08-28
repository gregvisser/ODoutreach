"use server";

import { revalidatePath } from "next/cache";

import { requireOpensDoorsStaff } from "@/server/auth/staff";
import {
  setClientOpenTracking,
  type SetOpenTrackingResult,
} from "@/server/clients/open-tracking-opt-in";

/**
 * Server action behind the per-client "Open tracking" switch on the Mailboxes
 * tab. Tracking is off for every client by default; this is the only way to
 * change that, and it refuses unless the customer's own tracking domain is
 * verified. No sends are triggered.
 */
export async function setClientOpenTrackingAction(input: {
  clientId: string;
  enabled: boolean;
}): Promise<SetOpenTrackingResult> {
  const staff = await requireOpensDoorsStaff();

  const result = await setClientOpenTracking({
    staff,
    clientId: input.clientId,
    enabled: input.enabled,
  });

  if (result.ok) {
    revalidatePath(`/clients/${input.clientId}/mailboxes`);
    revalidatePath(`/clients/${input.clientId}`);
  }

  return result;
}
