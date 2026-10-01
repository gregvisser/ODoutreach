import "server-only";

import { headers } from "next/headers";

import { prisma } from "@/lib/db";
import {
  normaliseRequestHost,
  resolveOrganisationIdForHost,
  safeAppOrigin,
} from "@/lib/tenant/hostname";
import { OPENSDOORS_ORGANISATION_ID } from "@/lib/tenant/organisation";

async function requestHostHeader(): Promise<string | null> {
  try {
    const bag = await headers();
    return bag.get("x-forwarded-host") ?? bag.get("host");
  } catch {
    return null;
  }
}

/** OpensDoors when the host is unknown, reserved, or the lookup fails. */
export async function organisationIdForRequest(): Promise<string> {
  const raw = await requestHostHeader();
  const host = normaliseRequestHost(raw);
  if (!host) return OPENSDOORS_ORGANISATION_ID;
  try {
    const rows = await prisma.organisation.findMany({
      where: { hostname: { not: null } },
      select: { id: true, hostname: true },
    });
    return resolveOrganisationIdForHost(host, rows);
  } catch {
    return OPENSDOORS_ORGANISATION_ID;
  }
}

/**
 * Origin to put in a mailbox OAuth redirect for this request.
 * Null keeps AUTH_URL, which is the OpensDoors redirect used today.
 */
export async function mailboxOAuthOriginForRequest(): Promise<string | null> {
  const raw = await requestHostHeader();
  let registered: string[] = [];
  try {
    const rows = await prisma.organisation.findMany({
      where: { hostname: { not: null } },
      select: { hostname: true },
    });
    registered = rows.flatMap((row) => (row.hostname ? [row.hostname] : []));
  } catch {
    registered = [];
  }
  return safeAppOrigin({
    requestHost: raw,
    registeredHosts: registered,
    authUrl: process.env.AUTH_URL,
  });
}
