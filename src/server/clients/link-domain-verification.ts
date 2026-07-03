import "server-only";

import { promises as dns } from "node:dns";

import { prisma } from "@/lib/db";
import {
  isGoDomainAllowedForClient,
  OUTREACH_LINK_APP_HOST,
} from "@/lib/clients/client-link-domain";
import { getClientMailboxMutationAllowed } from "@/server/mailbox-identities/mutator-access";
import { getAccessibleClientIds } from "@/server/tenant/access";
import type { StaffUser } from "@/generated/prisma/client";

/**
 * Verify + enable a client's sender-aligned outreach link domain (`go.<domain>`).
 *
 * The hard rule ([[odoutreach-deliverability]]) requires real-prospect outreach
 * to carry its unsubscribe + tracking links on a domain that aligns with the
 * sender. This helper is the one-click "switch it on" step: it PROVES the whole
 * chain is live before flipping the client to aligned, so we never enable a
 * client whose links would 404 or throw a certificate warning:
 *
 *   1. staff access + mailbox-mutator permission
 *   2. `goDomain` must derive from one of the client's real sending domains
 *   3. `https://<goDomain>/api/health` must return our app over valid TLS —
 *      this proves DNS resolves, the certificate is bound, AND the subdomain is
 *      routed to this exact app (so unsubscribe tokens will resolve)
 *   4. only then set `outreachLinkDomain` + `outreachLinkDomainVerifiedAt`
 *
 * No sends are triggered. Re-running on an already-enabled domain simply
 * re-verifies and refreshes the timestamp (idempotent).
 */

const HEALTH_PATH = "/api/health";
const VERIFY_TIMEOUT_MS = 8000;
/** Marker returned by GET /api/health that proves the host is THIS app. */
const APP_HEALTH_SERVICE = "opensdoors-outreach";

export type VerifyLinkDomainResult =
  | {
      ok: true;
      goDomain: string;
      verifiedAt: string;
      message: string;
    }
  | {
      ok: false;
      code:
        | "FORBIDDEN"
        | "NOT_FOUND"
        | "INVALID_DOMAIN"
        | "DNS_NOT_READY"
        | "HTTPS_NOT_READY"
        | "UNKNOWN_ERROR";
      message: string;
      /** Optional technical detail for operators (never a secret). */
      detail?: string;
    };

type HttpsProbe = { ok: boolean; status?: number; error?: string };

/**
 * Authoritative check: does `https://<goDomain>/api/health` return THIS app
 * over a valid certificate? Node's fetch rejects invalid TLS, so a resolved
 * promise with our health marker proves cert validity + correct routing.
 */
async function probeHttpsServesOurApp(goDomain: string): Promise<HttpsProbe> {
  try {
    const res = await fetch(`https://${goDomain}${HEALTH_PATH}`, {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
      headers: { "user-agent": "opensdoors-linkdomain-verify" },
    });
    if (res.status !== 200) return { ok: false, status: res.status };
    const body: unknown = await res.json().catch(() => null);
    const served =
      !!body &&
      typeof body === "object" &&
      (body as { ok?: unknown }).ok === true &&
      (body as { service?: unknown }).service === APP_HEALTH_SERVICE;
    return { ok: served, status: res.status };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

type CnameLookup = { targets: string[]; error?: string };

async function lookupCname(goDomain: string): Promise<CnameLookup> {
  try {
    const targets = await dns.resolveCname(goDomain);
    return { targets: targets.map((t) => t.toLowerCase().replace(/\.$/, "")) };
  } catch (e) {
    return { targets: [], error: e instanceof Error ? e.message : String(e) };
  }
}

/** True when the CNAME resolves into the Azure App Service (our host family). */
function cnamePointsToApp(lookup: CnameLookup): boolean {
  return lookup.targets.some(
    (t) => t === OUTREACH_LINK_APP_HOST || t.endsWith(".azurewebsites.net"),
  );
}

export async function verifyAndEnableClientLinkDomain(params: {
  staff: StaffUser;
  clientId: string;
  goDomain: string;
}): Promise<VerifyLinkDomainResult> {
  const { staff, clientId } = params;
  const goDomain = params.goDomain?.trim().toLowerCase() ?? "";

  // 1. Access — never enumerate tenants; treat no-access as NOT_FOUND.
  const accessible = await getAccessibleClientIds(staff);
  if (!accessible.includes(clientId)) {
    return {
      ok: false,
      code: "NOT_FOUND",
      message: "Client not found or access denied.",
    };
  }
  const canMutate = await getClientMailboxMutationAllowed(staff, clientId);
  if (!canMutate) {
    return {
      ok: false,
      code: "FORBIDDEN",
      message: "You do not have permission to change this client's link domain.",
    };
  }

  // 2. The domain must derive from one of the client's real sending domains.
  const mailboxes = await prisma.clientMailboxIdentity.findMany({
    where: { clientId },
    select: { email: true },
  });
  if (
    !isGoDomainAllowedForClient(
      goDomain,
      mailboxes.map((m) => m.email),
    )
  ) {
    return {
      ok: false,
      code: "INVALID_DOMAIN",
      message: `${goDomain || "(empty)"} is not the go. subdomain of any of this client's sending mailbox domains.`,
    };
  }

  // 3. Prove the chain is live. HTTPS-serving-our-app is authoritative; the
  //    CNAME lookup only enriches the failure message so staff know whether the
  //    customer still needs to add DNS or the Azure binding/cert is pending.
  const https = await probeHttpsServesOurApp(goDomain);
  if (!https.ok) {
    const cname = await lookupCname(goDomain);
    if (!cnamePointsToApp(cname)) {
      return {
        ok: false,
        code: "DNS_NOT_READY",
        message: `DNS for ${goDomain} isn't pointing to us yet. Ask the customer to add the CNAME record (go → ${OUTREACH_LINK_APP_HOST}), then try again once it propagates (usually within an hour).`,
        detail:
          cname.error ??
          (cname.targets.length
            ? `Currently resolves to: ${cname.targets.join(", ")}`
            : "No CNAME record found."),
      };
    }
    return {
      ok: false,
      code: "HTTPS_NOT_READY",
      message: `${goDomain} points to us but isn't serving securely yet — the Azure custom domain + certificate still needs to finish binding. Add the custom domain in Azure (if not done) and try again in a few minutes.`,
      detail: https.error ?? (https.status ? `Health check returned HTTP ${String(https.status)}` : undefined),
    };
  }

  // 4. Enable — write the verified link domain + audit the event.
  const verifiedAt = new Date();
  try {
    await prisma.$transaction(async (tx) => {
      await tx.client.update({
        where: { id: clientId },
        data: {
          outreachLinkDomain: goDomain,
          outreachLinkDomainVerifiedAt: verifiedAt,
        },
      });
      await tx.auditLog.create({
        data: {
          staffUserId: staff.id,
          clientId,
          action: "UPDATE",
          entityType: "Client.outreachLinkDomain",
          entityId: clientId,
          metadata: {
            event: "client_link_domain_verified_enabled",
            goDomain,
            verifiedAt: verifiedAt.toISOString(),
          },
        },
      });
    });
  } catch (e) {
    return {
      ok: false,
      code: "UNKNOWN_ERROR",
      message: e instanceof Error ? e.message : "Failed to save the link domain.",
    };
  }

  return {
    ok: true,
    goDomain,
    verifiedAt: verifiedAt.toISOString(),
    message: `${goDomain} verified and enabled — this client's outreach links now align with the sender.`,
  };
}
