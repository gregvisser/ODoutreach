"use server";

import { revalidatePath } from "next/cache";

import { requireOpensDoorsStaff } from "@/server/auth/staff";
import {
  verifyAndEnableClientLinkDomain,
  type VerifyLinkDomainResult,
} from "@/server/clients/link-domain-verification";

export type VerifyLinkDomainActionInput = {
  clientId: string;
  goDomain: string;
};

/**
 * Server action behind the Mailboxes "Verify & enable" button. Proves the
 * customer's `go.<domain>` is live (DNS + TLS + routed to us) and, only then,
 * records it as this client's verified outreach link domain. Revalidates the
 * Mailboxes page so the card reflects the new verified state immediately.
 * No sends are triggered.
 */
export async function verifyLinkDomainAction(
  input: VerifyLinkDomainActionInput,
): Promise<VerifyLinkDomainResult> {
  const staff = await requireOpensDoorsStaff();

  const result = await verifyAndEnableClientLinkDomain({
    staff,
    clientId: input.clientId,
    goDomain: input.goDomain,
  });

  if (result.ok) {
    revalidatePath(`/clients/${input.clientId}/mailboxes`);
    revalidatePath(`/clients/${input.clientId}`);
  }

  return result;
}
