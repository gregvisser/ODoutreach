import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import type { TenantScopeResolution } from "@/lib/db-tenant-guard";
import {
  ACTING_ORGANISATION_COOKIE,
  parseActingOrganisationCookie,
} from "@/lib/tenant/acting-organisation";
import { runResolvingOrganisationScope } from "@/lib/tenant/organisation-context";

import { resolveStaffActingOrganisation } from "./acting-organisation";
import { CLOSED_ORGANISATION_ID } from "./tenant-scope";

/**
 * Staff requests are scoped even when a page forgets to pass an organisation.
 * Next.js does not carry AsyncLocalStorage from a layout into the page, so
 * the Prisma hook resolves the session itself. Cron, webhooks, and scripts
 * have no session and stay unscoped until they opt in with `runInOrganisation`.
 * Integration tests set ORGANISATION_SCOPE_IMPLICIT=off so fixtures that
 * mock auth can still seed freely. Production leaves it on.
 */
const staffScope = cache(
  async (entraObjectId: string, requestedOrganisationId: string | null): Promise<TenantScopeResolution> => {
    const staff = await prisma.staffUser.findUnique({
      where: { entraObjectId },
      select: { id: true, isActive: true },
    });
    if (!staff?.isActive) {
      return { kind: "organisation", organisationId: CLOSED_ORGANISATION_ID };
    }
    // The cookie value is part of the cache key. The resolver reads that
    // same cookie, so a mid-request switch does not keep the previous organisation.
    void requestedOrganisationId;
    const acting = await resolveStaffActingOrganisation(staff.id);
    if (!acting) return { kind: "organisation", organisationId: CLOSED_ORGANISATION_ID };
    return { kind: "organisation", organisationId: acting.organisationId };
  },
);

export async function resolveImplicitTenantScope(): Promise<TenantScopeResolution> {
  if (process.env.ORGANISATION_SCOPE_IMPLICIT === "off") return { kind: "anonymous" };
  try {
    return await runResolvingOrganisationScope(async () => {
      const session = await auth();
      const entraObjectId = session?.user?.id?.trim();
      if (!entraObjectId) return { kind: "anonymous" };
      let requested: string | null = null;
      try {
        const jar = await cookies();
        requested = parseActingOrganisationCookie(jar.get(ACTING_ORGANISATION_COOKIE)?.value);
      } catch {
        requested = null;
      }
      return staffScope(entraObjectId, requested);
    });
  } catch {
    return { kind: "anonymous" };
  }
}
