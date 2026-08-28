import "server-only";

import { prisma } from "@/lib/db";
import { isClientLinkDomainReady } from "@/lib/clients/client-link-domain";
import { CLIENT_OPEN_TRACKING_SELECT } from "@/lib/tracking/client-open-tracking";
import { getClientMailboxMutationAllowed } from "@/server/mailbox-identities/mutator-access";
import { getAccessibleClientIds } from "@/server/tenant/access";
import type { StaffUser } from "@/generated/prisma/client";

/**
 * Switch open tracking on or off for ONE client.
 *
 * Switching ON is the only irreversible-ish direction — it changes what lands in
 * a real prospect's inbox — so it is gated:
 *
 *   1. staff access to the client + mailbox-mutator permission
 *   2. the client's aligned link domain must be VERIFIED. This is the customer's
 *      own DNS change; without it the pixel would have to be served from the
 *      OpensDoors app domain, which is the cross-domain phishing signal that got
 *      this client's outreach quarantined.
 *
 * Switching OFF is always allowed and never gated — turning tracking off can
 * only make a send safer, and a gate that could trap a client in the ON state
 * would be the wrong shape entirely.
 *
 * The gate refuses rather than corrects: an unverified client is told to verify
 * their domain first, not quietly enabled with a fallback URL.
 */

export type SetOpenTrackingResult =
  | { ok: true; enabled: boolean; message: string }
  | {
      ok: false;
      code: "FORBIDDEN" | "NOT_FOUND" | "LINK_DOMAIN_NOT_VERIFIED";
      message: string;
    };

export async function setClientOpenTracking(params: {
  staff: StaffUser;
  clientId: string;
  enabled: boolean;
}): Promise<SetOpenTrackingResult> {
  const { staff, clientId, enabled } = params;

  // Access — never enumerate tenants; treat no-access as NOT_FOUND.
  const accessible = await getAccessibleClientIds(staff);
  if (!accessible.includes(clientId)) {
    return { ok: false, code: "NOT_FOUND", message: "Client not found or access denied." };
  }
  const canMutate = await getClientMailboxMutationAllowed(staff, clientId);
  if (!canMutate) {
    return {
      ok: false,
      code: "FORBIDDEN",
      message: "You do not have permission to change this client's tracking setting.",
    };
  }

  const client = await prisma.client.findFirst({
    where: { id: clientId, deletedAt: null },
    select: CLIENT_OPEN_TRACKING_SELECT,
  });
  if (!client) {
    return { ok: false, code: "NOT_FOUND", message: "Client not found or access denied." };
  }

  if (enabled && !isClientLinkDomainReady(client)) {
    return {
      ok: false,
      code: "LINK_DOMAIN_NOT_VERIFIED",
      message:
        "Open tracking needs this customer's own tracking domain to be verified first. Ask them to add the DNS record, then use Verify & enable above — after that this switch will work.",
    };
  }

  const enabledAt = enabled ? new Date() : null;
  await prisma.$transaction(async (tx) => {
    await tx.client.update({
      where: { id: clientId },
      data: {
        openTrackingEnabledAt: enabledAt,
        openTrackingEnabledByStaffUserId: enabled ? staff.id : null,
      },
    });
    await tx.auditLog.create({
      data: {
        staffUserId: staff.id,
        clientId,
        action: "UPDATE",
        entityType: "Client.openTracking",
        entityId: clientId,
        metadata: {
          enabled,
          linkDomain: client.outreachLinkDomain,
          // Recorded so a later reader can tell WHICH verification this opt-in
          // was granted against, not merely that one existed at the time.
          linkDomainVerifiedAt: client.outreachLinkDomainVerifiedAt?.toISOString() ?? null,
        },
      },
    });
  });

  return {
    ok: true,
    enabled,
    message: enabled
      ? `Open tracking is ON for this customer. Their emails will carry a tracking pixel on ${client.outreachLinkDomain}.`
      : "Open tracking is OFF for this customer. Their emails will carry no tracking pixel.",
  };
}
