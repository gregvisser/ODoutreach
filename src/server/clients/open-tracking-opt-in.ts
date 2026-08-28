import "server-only";

import { prisma } from "@/lib/db";
import { isClientLinkDomainReady } from "@/lib/clients/client-link-domain";
import { CLIENT_OPEN_TRACKING_SELECT } from "@/lib/tracking/client-open-tracking";
import type { TrackingDnsSummary } from "@/lib/tracking/tracking-dns-checks";
import { getClientMailboxMutationAllowed } from "@/server/mailbox-identities/mutator-access";
import { getAccessibleClientIds } from "@/server/tenant/access";
import type { StaffUser } from "@/generated/prisma/client";

import {
  liveTrackingDnsResolver,
  verifyClientTrackingDns,
} from "./tracking-dns-verification";

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
 *   3. their SPF, DKIM, DMARC and tracking host must be RESOLVED, live, at the
 *      moment of the click, and all four must pass.
 *
 * Gate 3 is row 41, and it exists because of one sentence from Greg: **the
 * system verifies the DNS itself, and never trusts a tick-box.** A member of
 * staff confirming the customer "has done their DNS" is exactly the human error
 * this product exists to remove — and the cost of getting it wrong is the
 * customer's sending domain in quarantine.
 *
 * Note what is NOT relied on here: a stored `trackingDnsVerifiedAt` from an
 * earlier run. Enabling reads the live records, so the state that authorises
 * tracking is always evidence gathered within the last few seconds.
 *
 * Switching OFF is always allowed and never gated — turning tracking off can
 * only make a send safer, and a gate that could trap a client in the ON state
 * would be the wrong shape entirely. That includes not putting a DNS lookup in
 * its way: a customer with broken DNS must still be switchable off in an
 * incident.
 *
 * The gate refuses rather than corrects: an unverified client is told which
 * record failed and why, never quietly enabled with a fallback.
 */

export type SetOpenTrackingResult =
  | { ok: true; enabled: boolean; message: string }
  | {
      ok: false;
      code:
        | "FORBIDDEN"
        | "NOT_FOUND"
        | "LINK_DOMAIN_NOT_VERIFIED"
        | "EMAIL_AUTH_NOT_VERIFIED";
      message: string;
    };

/**
 * Resolve this client's DNS and judge it. Injected so a test can drive every
 * failure mode without anybody's live records; defaults to the real thing so a
 * call site cannot accidentally get a permissive stub.
 */
export type VerifyDnsFn = (clientId: string) => Promise<TrackingDnsSummary>;

async function liveVerify(clientId: string): Promise<TrackingDnsSummary> {
  const client = await prisma.client.findFirst({
    where: { id: clientId, deletedAt: null },
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
  if (!client) {
    return { pass: false, checks: [], failedLabels: ["SPF", "DKIM", "DMARC", "Tracking host"] };
  }
  return verifyClientTrackingDns(
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
}

export async function setClientOpenTracking(params: {
  staff: StaffUser;
  clientId: string;
  enabled: boolean;
  verifyDns?: VerifyDnsFn;
}): Promise<SetOpenTrackingResult> {
  const { staff, clientId, enabled } = params;
  const verifyDns = params.verifyDns ?? liveVerify;

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

  /*
    THE DNS IS RESOLVED HERE, NOW, and only when switching ON.

    A throw is a refusal, not an exception to handle upstream: "we could not
    reach a nameserver" and "their SPF is wrong" are the same answer to the only
    question being asked, which is *can we prove this domain is authenticated*.
    There is no branch below where an error becomes a pass.
  */
  let dns: TrackingDnsSummary | null = null;
  if (enabled) {
    try {
      dns = await verifyDns(clientId);
    } catch {
      dns = null;
    }
    if (!dns?.pass) {
      const failures = dns?.checks.filter((c) => !c.pass) ?? [];
      const detail = failures.length
        ? failures.map((c) => `${c.label} — ${c.detail}`).join(" ")
        : "The DNS records could not be read just now. Try again in a few minutes.";
      return {
        ok: false,
        code: "EMAIL_AUTH_NOT_VERIFIED",
        message: `Tracking cannot be switched on until this customer's email authentication checks out. We looked, and: ${detail}`,
      };
    }
  }

  const now = new Date();
  const enabledAt = enabled ? now : null;
  await prisma.$transaction(async (tx) => {
    await tx.client.update({
      where: { id: clientId },
      data: {
        openTrackingEnabledAt: enabledAt,
        openTrackingEnabledByStaffUserId: enabled ? staff.id : null,
        // Written from the check that just ran, never carried over from an
        // earlier one. Cleared on the way OFF so a later re-enable cannot
        // inherit stale evidence.
        trackingDnsVerifiedAt: enabled ? now : null,
        trackingDnsCheckedAt: enabled ? now : null,
        trackingDnsReport: enabled
          ? (dns?.checks.map((c) => ({
              label: c.label,
              pass: c.pass,
              detail: c.detail,
            })) ?? [])
          : undefined,
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
          // The actual records read at the moment of the decision. Without this
          // the audit says a check happened but not what it saw.
          dnsChecks:
            dns?.checks.map((c) => ({ label: c.label, pass: c.pass, detail: c.detail })) ??
            null,
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
