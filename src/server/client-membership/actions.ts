"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { Prisma } from "@/generated/prisma/client";
import type { ClientMemberRole } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import {
  canAssignClientWorkspaceMembership,
  requireClientAccess,
} from "@/server/tenant/access";

export type ClientMembershipActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

const memberRoleSchema = z.enum(["LEAD", "CONTRIBUTOR", "VIEWER"]);

const addSchema = z.object({
  clientId: z.string().min(1),
  staffUserId: z.string().min(1),
  membershipRole: memberRoleSchema,
});

export async function addStaffToClientWorkspace(
  raw: z.infer<typeof addSchema>,
): Promise<ClientMembershipActionResult> {
  try {
    const actor = await requireOpensDoorsStaff();
    if (!canAssignClientWorkspaceMembership(actor)) {
      return {
        ok: false,
        error: "Only administrators and managers can assign staff to a client workspace.",
      };
    }
    const data = addSchema.parse(raw);
    await requireClientAccess(actor, data.clientId);

    await prisma.clientMembership.create({
      data: {
        clientId: data.clientId,
        staffUserId: data.staffUserId,
        role: data.membershipRole as ClientMemberRole,
      },
    });

    await prisma.auditLog.create({
      data: {
        staffUserId: actor.id,
        clientId: data.clientId,
        action: "CREATE",
        entityType: "ClientMembership",
        entityId: data.staffUserId,
        metadata: {
          op: "workspace_member_add",
          membershipRole: data.membershipRole,
        },
      },
    });

    revalidatePath(`/clients/${data.clientId}`);
    revalidatePath("/clients");
    return { ok: true, message: "Team member added to this workspace." };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return {
        ok: false,
        error: "That staff member is already on this workspace.",
      };
    }
    if (e instanceof Error && e.message === "FORBIDDEN_CLIENT") {
      return { ok: false, error: "You cannot manage team access for this workspace." };
    }
    const msg = e instanceof Error ? e.message : "Could not add team member.";
    return { ok: false, error: msg };
  }
}

const membershipIdSchema = z.object({
  clientId: z.string().min(1),
  membershipId: z.string().min(1),
});

export async function removeClientWorkspaceMember(
  raw: z.infer<typeof membershipIdSchema>,
): Promise<ClientMembershipActionResult> {
  try {
    const actor = await requireOpensDoorsStaff();
    if (!canAssignClientWorkspaceMembership(actor)) {
      return {
        ok: false,
        error: "Only administrators and managers can remove workspace access.",
      };
    }
    const data = membershipIdSchema.parse(raw);
    await requireClientAccess(actor, data.clientId);

    const existing = await prisma.clientMembership.findFirst({
      where: { id: data.membershipId, clientId: data.clientId },
      select: { id: true, staffUserId: true },
    });
    if (!existing) {
      return { ok: false, error: "Membership not found for this workspace." };
    }

    await prisma.clientMembership.delete({ where: { id: existing.id } });

    await prisma.auditLog.create({
      data: {
        staffUserId: actor.id,
        clientId: data.clientId,
        action: "DELETE",
        entityType: "ClientMembership",
        entityId: existing.staffUserId,
        metadata: { op: "workspace_member_remove", membershipId: existing.id },
      },
    });

    revalidatePath(`/clients/${data.clientId}`);
    revalidatePath("/clients");
    return { ok: true, message: "Workspace access removed." };
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN_CLIENT") {
      return { ok: false, error: "You cannot manage team access for this workspace." };
    }
    const msg = e instanceof Error ? e.message : "Could not remove access.";
    return { ok: false, error: msg };
  }
}

const updateSchema = membershipIdSchema.extend({
  membershipRole: memberRoleSchema,
});

export async function updateClientWorkspaceMemberRole(
  raw: z.infer<typeof updateSchema>,
): Promise<ClientMembershipActionResult> {
  try {
    const actor = await requireOpensDoorsStaff();
    if (!canAssignClientWorkspaceMembership(actor)) {
      return {
        ok: false,
        error: "Only administrators and managers can change workspace roles.",
      };
    }
    const data = updateSchema.parse(raw);
    await requireClientAccess(actor, data.clientId);

    const existing = await prisma.clientMembership.findFirst({
      where: { id: data.membershipId, clientId: data.clientId },
      select: { id: true, staffUserId: true, role: true },
    });
    if (!existing) {
      return { ok: false, error: "Membership not found for this workspace." };
    }

    await prisma.clientMembership.update({
      where: { id: existing.id },
      data: { role: data.membershipRole as ClientMemberRole },
    });

    await prisma.auditLog.create({
      data: {
        staffUserId: actor.id,
        clientId: data.clientId,
        action: "UPDATE",
        entityType: "ClientMembership",
        entityId: existing.staffUserId,
        metadata: {
          op: "workspace_member_role",
          fromRole: existing.role,
          toRole: data.membershipRole,
        },
      },
    });

    revalidatePath(`/clients/${data.clientId}`);
    revalidatePath("/clients");
    return { ok: true, message: "Workspace role updated." };
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN_CLIENT") {
      return { ok: false, error: "You cannot manage team access for this workspace." };
    }
    const msg = e instanceof Error ? e.message : "Could not update role.";
    return { ok: false, error: msg };
  }
}
