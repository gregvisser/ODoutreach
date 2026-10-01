import "server-only";

import { randomUUID } from "node:crypto";

import { Prisma } from "@/generated/prisma/client";
import type { OrganisationMemberRole, OrganisationStatus, StaffRole } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { normalizeEmail } from "@/lib/normalize";
import {
  OPENSDOORS_FEATURE_FLAG_DEFAULTS,
  resolveOrganisationFeatureFlags,
} from "@/lib/tenant/organisation";
import { parseOrganisationSlug } from "@/lib/tenant/platform";

export type OrganisationMutationResult =
  | { ok: true; organisationId: string }
  | { ok: false; error: string };

export type ProvisionedStaffResult =
  | { ok: true; staffUserId: string }
  | { ok: false; error: string };

function uniqueConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function createOrganisationRecord(input: {
  name: string;
  slug: string;
}): Promise<OrganisationMutationResult> {
  const name = input.name.trim();
  const slug = parseOrganisationSlug(input.slug);
  if (name.length < 2 || name.length > 80) {
    return { ok: false, error: "Enter an organisation name between 2 and 80 characters." };
  }
  if (!slug) {
    return {
      ok: false,
      error: "Use a slug of 2–40 characters: lowercase letters, numbers, and single hyphens.",
    };
  }

  try {
    const created = await prisma.organisation.create({
      data: {
        name,
        slug,
        status: "ACTIVE",
        featureFlags: OPENSDOORS_FEATURE_FLAG_DEFAULTS,
      },
      select: { id: true },
    });
    return { ok: true, organisationId: created.id };
  } catch (error) {
    if (uniqueConflict(error)) {
      return { ok: false, error: "An organisation with that slug already exists." };
    }
    throw error;
  }
}

export async function setOrganisationStatus(
  organisationId: string,
  status: OrganisationStatus,
): Promise<OrganisationMutationResult> {
  const existing = await prisma.organisation.findUnique({
    where: { id: organisationId },
    select: { id: true },
  });
  if (!existing) return { ok: false, error: "Organisation not found." };
  await prisma.organisation.update({
    where: { id: organisationId },
    data: { status },
  });
  return { ok: true, organisationId };
}

/**
 * Persist a complete flag object. Unknown keys and non-booleans are dropped.
 * Missing keys stay on, matching OpensDoors today. This stores the choice;
 * product code consults it in the enforcement stage.
 */
export async function updateOrganisationFlags(
  organisationId: string,
  stored: unknown,
): Promise<OrganisationMutationResult> {
  const existing = await prisma.organisation.findUnique({
    where: { id: organisationId },
    select: { id: true },
  });
  if (!existing) return { ok: false, error: "Organisation not found." };
  const flags = resolveOrganisationFeatureFlags(stored);
  await prisma.organisation.update({
    where: { id: organisationId },
    data: { featureFlags: flags },
  });
  return { ok: true, organisationId };
}

/**
 * Save or clear the public hostname. The caller has already rejected
 * schemes, paths, and the reserved OpensDoors host on any other organisation.
 */
export async function updateOrganisationHostname(
  organisationId: string,
  hostname: string | null,
): Promise<OrganisationMutationResult> {
  const existing = await prisma.organisation.findUnique({
    where: { id: organisationId },
    select: { id: true },
  });
  if (!existing) return { ok: false, error: "Organisation not found." };
  try {
    await prisma.organisation.update({
      where: { id: organisationId },
      data: { hostname },
    });
  } catch (error) {
    if (uniqueConflict(error)) {
      return { ok: false, error: "That hostname is already used." };
    }
    throw error;
  }
  return { ok: true, organisationId };
}

/**
 * Create a pending staff row and attach it to the named organisation.
 * Never sets platform or super-admin. Does not call Microsoft Graph.
 * Refuses an email that already has an account — the caller adds a
 * membership instead of a second person.
 */
export async function provisionPendingOrganisationMember(input: {
  organisationId: string;
  email: string;
  staffRole: StaffRole;
  membershipRole: OrganisationMemberRole;
  invitedById: string;
  isActive?: boolean;
}): Promise<ProvisionedStaffResult> {
  const email = normalizeEmail(input.email);
  if (!email.includes("@")) {
    return { ok: false, error: "Enter a valid email address." };
  }

  const organisation = await prisma.organisation.findUnique({
    where: { id: input.organisationId },
    select: { id: true },
  });
  if (!organisation) return { ok: false, error: "Organisation not found." };

  const existing = await prisma.staffUser.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    return {
      ok: false,
      error: "A staff user with this email already exists. Add them to the organisation instead of creating a second account.",
    };
  }

  const draft = await prisma.staffUser.create({
    data: {
      entraObjectId: randomUUID(),
      email,
      displayName: null,
      role: input.staffRole,
      isActive: input.isActive ?? true,
      isSuperAdmin: false,
      isPlatformAdmin: false,
      guestInvitationState: "PENDING",
      invitedAt: new Date(),
      invitedById: input.invitedById,
    },
    select: { id: true },
  });

  try {
    // The integration database inserts an OpensDoors membership for every
    // new staff row. A new account belongs only to the organisation they
    // were invited into, so drop that extra row. Production has no trigger.
    await prisma.organisationMember.deleteMany({
      where: {
        staffUserId: draft.id,
        organisationId: { not: input.organisationId },
      },
    });
    await prisma.organisationMember.upsert({
      where: {
        organisationId_staffUserId: {
          organisationId: input.organisationId,
          staffUserId: draft.id,
        },
      },
      create: {
        organisationId: input.organisationId,
        staffUserId: draft.id,
        role: input.membershipRole,
      },
      update: {
        role: input.membershipRole,
      },
    });
  } catch (error) {
    await prisma.staffUser.delete({ where: { id: draft.id } });
    if (uniqueConflict(error)) {
      return { ok: false, error: "A staff user with this email already exists." };
    }
    throw error;
  }

  return { ok: true, staffUserId: draft.id };
}

export const ALREADY_IN_ORGANISATION = "This person is already in this organisation.";

/**
 * Attach an existing account to another organisation. Does not create a
 * second staff row, does not call Microsoft, and does not change platform
 * admin, super-admin, or the account's staff role.
 */
export async function addExistingStaffToOrganisation(input: {
  organisationId: string;
  staffUserId: string;
  membershipRole: OrganisationMemberRole;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const organisation = await prisma.organisation.findUnique({
    where: { id: input.organisationId },
    select: { id: true },
  });
  if (!organisation) return { ok: false, error: "Organisation not found." };

  const staff = await prisma.staffUser.findUnique({
    where: { id: input.staffUserId },
    select: { id: true },
  });
  if (!staff) return { ok: false, error: "Staff user not found." };

  const existing = await prisma.organisationMember.findUnique({
    where: {
      organisationId_staffUserId: {
        organisationId: input.organisationId,
        staffUserId: input.staffUserId,
      },
    },
    select: { id: true },
  });
  if (existing) return { ok: false, error: ALREADY_IN_ORGANISATION };

  try {
    await prisma.organisationMember.create({
      data: {
        organisationId: input.organisationId,
        staffUserId: input.staffUserId,
        role: input.membershipRole,
      },
    });
  } catch (error) {
    if (uniqueConflict(error)) return { ok: false, error: ALREADY_IN_ORGANISATION };
    throw error;
  }
  return { ok: true };
}
