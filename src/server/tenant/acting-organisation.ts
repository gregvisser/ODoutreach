import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";

import { prisma } from "@/lib/db";
import { runInOrganisation } from "@/lib/tenant/organisation-context";
import {
  ACTING_ORGANISATION_COOKIE,
  chooseActingOrganisation,
  parseActingOrganisationCookie,
  PLATFORM_ADMIN_ENTERED_OP,
  type ActingMembership,
  type ActingOrganisation,
} from "@/lib/tenant/acting-organisation";
import { hasPlatformAdminAccess } from "@/lib/tenant/organisation";

const membershipSelect = {
  organisationId: true,
  role: true,
  createdAt: true,
  organisation: { select: { status: true, name: true, slug: true } },
} as const;

export type EnterableOrganisation = {
  id: string;
  name: string;
  status: "ACTIVE" | "SUSPENDED";
};

async function readRequestedOrganisationId(): Promise<string | null> {
  try {
    const jar = await cookies();
    return parseActingOrganisationCookie(jar.get(ACTING_ORGANISATION_COOKIE)?.value);
  } catch {
    // No request cookie store (tests, and any caller outside a render).
    // That is "no selection", which stays on the person's own membership.
    return null;
  }
}

const resolveCached = cache(
  async (staffId: string, requestedOrganisationId: string | null): Promise<ActingOrganisation | null> => {
    const staff = await prisma.staffUser.findUnique({
      where: { id: staffId },
      select: {
        email: true,
        isPlatformAdmin: true,
        organisationMemberships: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: membershipSelect,
        },
      },
    });
    if (!staff) return null;

    const memberships: ActingMembership[] = staff.organisationMemberships.map((row) => ({
      organisationId: row.organisationId,
      role: row.role,
      status: row.organisation.status,
      name: row.organisation.name,
      slug: row.organisation.slug,
    }));
    const platformAdmin = hasPlatformAdminAccess(staff);
    const alreadyMember = requestedOrganisationId
      ? memberships.some((item) => item.organisationId === requestedOrganisationId)
      : false;

    let requestedOrganisation: ActingMembership | null = null;
    if (requestedOrganisationId && !alreadyMember && platformAdmin) {
      const organisation = await prisma.organisation.findUnique({
        where: { id: requestedOrganisationId },
        select: { id: true, name: true, slug: true, status: true },
      });
      if (organisation) {
        requestedOrganisation = {
          organisationId: organisation.id,
          role: "OWNER",
          status: organisation.status,
          name: organisation.name,
          slug: organisation.slug,
        };
      }
    }

    return chooseActingOrganisation({
      memberships,
      requestedOrganisationId,
      requestedOrganisation,
      platformAdmin,
    });
  },
);

/**
 * The organisation this session may read and write. A cookie is only a
 * request. Membership, or platform-admin entry of a real organisation,
 * decides whether it is honoured.
 */
export async function resolveStaffActingOrganisation(staffId: string): Promise<ActingOrganisation | null> {
  if (!staffId) return null;
  const requested = await readRequestedOrganisationId();
  return resolveCached(staffId, requested);
}

export async function listOrganisationsStaffMayEnter(staff: {
  id: string;
  email: string;
  isPlatformAdmin: boolean;
}): Promise<EnterableOrganisation[]> {
  if (hasPlatformAdminAccess(staff)) {
    return prisma.organisation.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, status: true },
    });
  }
  const rows = await prisma.organisationMember.findMany({
    where: { staffUserId: staff.id },
    orderBy: { organisation: { name: "asc" } },
    select: { organisation: { select: { id: true, name: true, status: true } } },
  });
  return rows.map((row) => row.organisation);
}

async function setActingOrganisationCookie(organisationId: string): Promise<void> {
  const jar = await cookies();
  jar.set(ACTING_ORGANISATION_COOKIE, organisationId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 400,
  });
}

/**
 * Enter an organisation. Members may enter one they belong to. A platform
 * admin may enter any organisation, and that entry is written to the audit
 * log. Anyone else is refused and the cookie is left unchanged.
 */
export async function enterOrganisation(input: {
  staffUserId: string;
  email: string;
  isPlatformAdmin: boolean;
  organisationId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const organisationId = input.organisationId.trim();
  if (!organisationId) return { ok: false, error: "Organisation not found." };

  const organisation = await prisma.organisation.findUnique({
    where: { id: organisationId },
    select: { id: true, name: true, slug: true },
  });
  if (!organisation) return { ok: false, error: "Organisation not found." };

  const platformAdmin = hasPlatformAdminAccess(input);
  const membership = await prisma.organisationMember.findUnique({
    where: {
      organisationId_staffUserId: {
        organisationId: organisation.id,
        staffUserId: input.staffUserId,
      },
    },
    select: { id: true },
  });
  if (!membership && !platformAdmin) {
    return { ok: false, error: "You are not in that organisation." };
  }

  await setActingOrganisationCookie(organisation.id);

  if (platformAdmin) {
    await runInOrganisation(organisation.id, () => prisma.auditLog.create({
      data: {
        organisationId: organisation.id,
        staffUserId: input.staffUserId,
        action: "LOGIN",
        entityType: "Organisation",
        entityId: organisation.id,
        metadata: {
          op: PLATFORM_ADMIN_ENTERED_OP,
          organisationId: organisation.id,
          organisationName: organisation.name,
          organisationSlug: organisation.slug,
        },
      },
    }));
  }

  return { ok: true };
}
