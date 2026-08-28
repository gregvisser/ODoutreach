"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import {
  setClientOpenTracking,
  type SetOpenTrackingResult,
} from "@/server/clients/open-tracking-opt-in";
import {
  disableTrackingForDnsRegression,
  persistTrackingDnsCheck,
} from "@/server/clients/tracking-dns-persistence";
import {
  liveTrackingDnsResolver,
  verifyClientTrackingDns,
} from "@/server/clients/tracking-dns-verification";
import { getAccessibleClientIds } from "@/server/tenant/access";

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

/**
 * Resolve this customer's SPF, DKIM, DMARC and tracking host NOW and record what
 * was found, without changing whether tracking is on.
 *
 * This is the button staff press after asking a customer's IT department to fix
 * a record: it re-reads the live DNS and updates the four lines on screen. It is
 * read-and-record only in the safe direction — a passing check refreshes the
 * verification, and a failing one clears it, which can only ever turn tracking
 * off, never on.
 *
 * Switching tracking ON still runs its own check inside `setClientOpenTracking`.
 * This action is a diagnostic, never the thing that authorises tracking.
 */
export async function checkClientTrackingDnsAction(input: {
  clientId: string;
}): Promise<{ ok: boolean; message: string }> {
  const staff = await requireOpensDoorsStaff();

  const accessible = await getAccessibleClientIds(staff);
  if (!accessible.includes(input.clientId)) {
    return { ok: false, message: "Client not found or access denied." };
  }

  const client = await prisma.client.findFirst({
    where: { id: input.clientId, deletedAt: null },
    select: {
      id: true,
      name: true,
      outreachLinkDomain: true,
      outreachLinkDomainVerifiedAt: true,
      openTrackingEnabledAt: true,
      trackingDnsVerifiedAt: true,
      mailboxIdentities: { select: { email: true, provider: true } },
    },
  });
  if (!client) return { ok: false, message: "Client not found or access denied." };

  const summary = await verifyClientTrackingDns(
    {
      id: client.id,
      name: client.name,
      outreachLinkDomain: client.outreachLinkDomain,
      outreachLinkDomainVerifiedAt: client.outreachLinkDomainVerifiedAt,
      openTrackingEnabledAt: client.openTrackingEnabledAt,
      trackingDnsVerifiedAt: client.trackingDnsVerifiedAt,
      mailboxes: client.mailboxIdentities.map((m) => ({
        email: m.email,
        provider: m.provider,
      })),
    },
    liveTrackingDnsResolver,
  );

  const now = new Date();
  await persistTrackingDnsCheck({
    clientId: client.id,
    pass: summary.pass,
    verifiedAt: summary.pass ? now : null,
    checkedAt: now,
    summary,
  });

  /*
    A check that now FAILS for a client whose tracking is ON must switch it off
    here, not wait for tonight's sweep. Staff pressing this button is the same
    question the sweep asks, and answering it differently depending on who asked
    would be indefensible.
  */
  if (!summary.pass && client.openTrackingEnabledAt != null) {
    await disableTrackingForDnsRegression({
      clientId: client.id,
      clientName: client.name,
      failedLabels: summary.failedLabels,
      summary,
      at: now,
    });
  }

  revalidatePath(`/clients/${input.clientId}/mailboxes`);

  return {
    ok: summary.pass,
    message: summary.pass
      ? "All four DNS checks pass. This customer's domain is ready for tracking."
      : `Not ready yet — ${summary.failedLabels.join(", ")} did not pass. The details are listed above.`,
  };
}
