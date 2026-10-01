import "server-only";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { normalizeEmail } from "@/lib/normalize";
import { isStaffEmailAllowed } from "@/lib/staff-email-policy";
import { formatInvitationErrorForBanner } from "@/lib/staff-access/invitation-errors";
import type { OrganisationMemberRole, StaffRole } from "@/generated/prisma/enums";
import {
  createGuestInvitation,
  GuestInvitationError,
} from "@/server/microsoft-graph/guest-invitations";
import { logStaffAccessAudit } from "@/server/staff-access/audit";

import {
  addExistingStaffToOrganisation,
  provisionPendingOrganisationMember,
} from "./platform-orgs";

export const ADDED_EXISTING_ACCOUNT =
  "Added to this organisation. They already have an account, so no new Microsoft invitation was sent.";

export type StaffInviteResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

const emailSchema = z.string().email();

export function staffInviteRedirectUrl(): string {
  const explicit = process.env.STAFF_INVITE_REDIRECT_URL?.trim();
  const authUrl = process.env.AUTH_URL?.trim();
  const base = explicit || authUrl;
  if (!base) {
    throw new Error("Set AUTH_URL or STAFF_INVITE_REDIRECT_URL for invitation return URL");
  }
  return `${base.replace(/\/$/, "")}/sign-in`;
}

function describeInvitationFailure(error: unknown, fallback: string): string {
  if (error instanceof GuestInvitationError) {
    return formatInvitationErrorForBanner(error.classified);
  }
  if (error instanceof Error) return error.message;
  return fallback;
}

/**
 * Add someone to one organisation.
 *
 * An email that already has an account gets a membership only. Their
 * platform access, super-admin flag, and staff role stay as they are, and
 * Microsoft is not asked to invite them again.
 *
 * A new email is provisioned, then Microsoft Graph sends the guest
 * invitation. Graph failure deletes that new row. Callers must already
 * have authorised the actor. This function never sets platform or
 * super-admin.
 */
export async function inviteStaffIntoOrganisation(input: {
  actorStaffUserId: string;
  organisationId: string;
  email: string;
  staffRole: StaffRole;
  membershipRole: OrganisationMemberRole;
  isActive?: boolean;
}): Promise<StaffInviteResult> {
  const parsed = emailSchema.safeParse(input.email.trim());
  if (!parsed.success) {
    return { ok: false, error: "Enter a valid email address." };
  }
  const email = normalizeEmail(parsed.data);
  if (!isStaffEmailAllowed({ email })) {
    return {
      ok: false,
      error:
        "That email is not allowed by STAFF_EMAIL_DOMAINS. Add the domain to STAFF_EMAIL_DOMAINS before this person can sign in.",
    };
  }

  const existing = await prisma.staffUser.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existing) {
    const added = await addExistingStaffToOrganisation({
      organisationId: input.organisationId,
      staffUserId: existing.id,
      membershipRole: input.membershipRole,
    });
    if (!added.ok) return added;

    await logStaffAccessAudit({
      actorStaffUserId: input.actorStaffUserId,
      action: "CREATE",
      targetStaffUserId: existing.id,
      organisationId: input.organisationId,
      metadata: {
        op: "organisation_member_added",
        inviteeEmail: email,
        role: input.staffRole,
        organisationId: input.organisationId,
        membershipRole: input.membershipRole,
        existingAccount: true,
      },
    });
    revalidatePath("/settings/staff-access");
    revalidatePath("/settings/organisation");
    revalidatePath("/platform");
    revalidatePath(`/platform/${input.organisationId}`);
    return { ok: true, message: ADDED_EXISTING_ACCOUNT };
  }

  let redirect: string;
  try {
    redirect = staffInviteRedirectUrl();
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Invitation failed",
    };
  }

  const provisioned = await provisionPendingOrganisationMember({
    organisationId: input.organisationId,
    email,
    staffRole: input.staffRole,
    membershipRole: input.membershipRole,
    invitedById: input.actorStaffUserId,
    isActive: input.isActive,
  });
  if (!provisioned.ok) return provisioned;

  try {
    const graph = await createGuestInvitation(email, redirect);
    await prisma.staffUser.update({
      where: { id: provisioned.staffUserId },
      data: {
        graphInvitationId: graph.invitationId,
        graphInvitedUserObjectId: graph.invitedUserObjectId,
        invitationLastSentAt: new Date(),
      },
    });
  } catch (error) {
    await prisma.staffUser.delete({ where: { id: provisioned.staffUserId } });
    return {
      ok: false,
      error: describeInvitationFailure(error, "Invitation failed"),
    };
  }

  await logStaffAccessAudit({
    actorStaffUserId: input.actorStaffUserId,
    action: "CREATE",
    targetStaffUserId: provisioned.staffUserId,
    organisationId: input.organisationId,
    metadata: {
      op: "invite_sent",
      inviteeEmail: email,
      role: input.staffRole,
      organisationId: input.organisationId,
      membershipRole: input.membershipRole,
    },
  });

  revalidatePath("/settings/staff-access");
  revalidatePath("/settings/organisation");
  revalidatePath("/platform");
  revalidatePath(`/platform/${input.organisationId}`);
  return {
    ok: true,
    message: "Invitation sent. The user must accept the Microsoft email before signing in.",
  };
}
