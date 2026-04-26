"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { Prisma } from "@/generated/prisma/client";
import { isMailboxRemovedFromWorkspace } from "@/lib/mailbox-workspace-removal";
import { prisma } from "@/lib/db";
import { isValidEmailFormat, normalizeEmail } from "@/lib/normalize";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import {
  assertActiveMailboxLimit,
  assertPrimaryRequiresActive,
  startOfNextUtcDay,
} from "@/lib/mailbox-identities";
import { requireClientMailboxMutator } from "@/server/mailbox-identities/mutator-access";

const providerSchema = z.enum(["MICROSOFT", "GOOGLE"]);

const baseFields = {
  displayName: z.string().max(200).optional().nullable(),
  canSend: z.boolean(),
  canReceive: z.boolean(),
  isSendingEnabled: z.boolean(),
  isActive: z.boolean(),
  isPrimary: z.boolean(),
  lastError: z.string().max(4000).optional().nullable(),
};

const createSchema = z.object({
  clientId: z.string().min(1),
  provider: providerSchema,
  email: z.string().min(3).max(320),
  ...baseFields,
  dailySendCap: z.coerce.number().int().min(1).max(5000).default(30),
});

const updateSchema = z.object({
  clientId: z.string().min(1),
  mailboxId: z.string().min(1),
  ...baseFields,
  dailySendCap: z.coerce.number().int().min(1).max(5000),
});

export type MailboxActionResult =
  | { ok: true }
  | { ok: false; error: string };

async function auditMailbox(
  staffUserId: string,
  clientId: string,
  mailboxId: string,
  action: "CREATE" | "UPDATE",
  metadata: Prisma.InputJsonValue,
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      staffUserId,
      clientId,
      action,
      entityType: "ClientMailboxIdentity",
      entityId: mailboxId,
      metadata,
    },
  });
}

export async function createClientMailboxIdentity(
  raw: z.infer<typeof createSchema>,
): Promise<MailboxActionResult> {
  const staff = await requireOpensDoorsStaff();
  const data = createSchema.safeParse(raw);
  if (!data.success) {
    return { ok: false, error: data.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    await requireClientMailboxMutator(staff, data.data.clientId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Forbidden" };
  }

  const emailNormalized = normalizeEmail(data.data.email);
  if (!isValidEmailFormat(emailNormalized)) {
    return { ok: false, error: "Enter a valid email address." };
  }

  const emailDupe = await prisma.clientMailboxIdentity.findFirst({
    where: { clientId: data.data.clientId, emailNormalized },
  });
  if (emailDupe) {
    if (emailDupe.workspaceRemovedAt) {
      return {
        ok: false,
        error:
          "This email was removed from the workspace. Open Mailboxes, show removed mailboxes, and click Restore — then run Connect if needed.",
      };
    }
    return { ok: false, error: "A mailbox with this email already exists for this client." };
  }

  assertPrimaryRequiresActive(data.data.isPrimary, data.data.isActive);

  const now = new Date();
  const windowEnd = startOfNextUtcDay(now);

  try {
    await prisma.$transaction(async (tx) => {
      const activeCount = await tx.clientMailboxIdentity.count({
        where: {
          clientId: data.data.clientId,
          isActive: true,
          workspaceRemovedAt: null,
        },
      });
      if (data.data.isActive) {
        assertActiveMailboxLimit(activeCount, true);
      }

      if (data.data.isPrimary) {
        await tx.clientMailboxIdentity.updateMany({
          where: { clientId: data.data.clientId, isPrimary: true },
          data: { isPrimary: false },
        });
      }

      const row = await tx.clientMailboxIdentity.create({
        data: {
          clientId: data.data.clientId,
          provider: data.data.provider,
          email: emailNormalized,
          emailNormalized,
          displayName: data.data.displayName?.trim() || null,
          connectionStatus: "DRAFT",
          canSend: data.data.canSend,
          canReceive: data.data.canReceive,
          dailySendCap: data.data.dailySendCap,
          isSendingEnabled: data.data.isSendingEnabled,
          isActive: data.data.isActive,
          isPrimary: data.data.isPrimary,
          lastError: data.data.lastError?.trim() || null,
          emailsSentToday: 0,
          dailyWindowResetAt: windowEnd,
          createdByStaffUserId: staff.id,
        },
      });

      await auditMailbox(staff.id, data.data.clientId, row.id, "CREATE", {
        email: emailNormalized,
        provider: data.data.provider,
        connectionStatus: "DRAFT",
        isActive: data.data.isActive,
        isPrimary: data.data.isPrimary,
      });
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Save failed";
    if (
      typeof e === "object" &&
      e !== null &&
      "code" in e &&
      (e as { code: string }).code === "P2002"
    ) {
      return { ok: false, error: "A mailbox with this email already exists for this client." };
    }
    return { ok: false, error: msg };
  }

  revalidatePath(`/clients/${data.data.clientId}`);
  return { ok: true };
}

export async function updateClientMailboxIdentity(
  raw: z.infer<typeof updateSchema>,
): Promise<MailboxActionResult> {
  const staff = await requireOpensDoorsStaff();
  const data = updateSchema.safeParse(raw);
  if (!data.success) {
    return { ok: false, error: data.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    await requireClientMailboxMutator(staff, data.data.clientId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Forbidden" };
  }

  assertPrimaryRequiresActive(data.data.isPrimary, data.data.isActive);

  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.clientMailboxIdentity.findFirst({
        where: { id: data.data.mailboxId, clientId: data.data.clientId },
      });
      if (!existing) {
        throw new Error("Mailbox not found.");
      }
      if (isMailboxRemovedFromWorkspace(existing)) {
        throw new Error("This mailbox was removed from the workspace. Restore it before editing.");
      }

      const activeCount = await tx.clientMailboxIdentity.count({
        where: {
          clientId: data.data.clientId,
          isActive: true,
          workspaceRemovedAt: null,
          id: { not: existing.id },
        },
      });

      if (data.data.isActive && !existing.isActive) {
        assertActiveMailboxLimit(activeCount, true);
      }

      if (data.data.isPrimary) {
        await tx.clientMailboxIdentity.updateMany({
          where: {
            clientId: data.data.clientId,
            isPrimary: true,
            id: { not: existing.id },
          },
          data: { isPrimary: false },
        });
      }

      const next = await tx.clientMailboxIdentity.update({
        where: { id: existing.id },
        data: {
          displayName: data.data.displayName?.trim() || null,
          canSend: data.data.canSend,
          canReceive: data.data.canReceive,
          dailySendCap: data.data.dailySendCap,
          isSendingEnabled: data.data.isSendingEnabled,
          isActive: data.data.isActive,
          isPrimary: data.data.isPrimary ? true : false,
          lastError: data.data.lastError?.trim() || null,
          ...(data.data.isActive === false
            ? { isPrimary: false }
            : {}),
        },
      });

      await auditMailbox(staff.id, data.data.clientId, next.id, "UPDATE", {
        before: {
          isActive: existing.isActive,
          isPrimary: existing.isPrimary,
          isSendingEnabled: existing.isSendingEnabled,
          dailySendCap: existing.dailySendCap,
        },
        after: {
          isActive: next.isActive,
          isPrimary: next.isPrimary,
          isSendingEnabled: next.isSendingEnabled,
          dailySendCap: next.dailySendCap,
        },
      });
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Save failed" };
  }

  revalidatePath(`/clients/${data.data.clientId}`);
  return { ok: true };
}

export async function setClientMailboxPrimary(
  clientId: string,
  mailboxId: string,
): Promise<MailboxActionResult> {
  const staff = await requireOpensDoorsStaff();
  try {
    await requireClientMailboxMutator(staff, clientId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Forbidden" };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const row = await tx.clientMailboxIdentity.findFirst({
        where: { id: mailboxId, clientId },
      });
      if (!row) throw new Error("Mailbox not found.");
      if (isMailboxRemovedFromWorkspace(row)) {
        throw new Error("Removed mailboxes cannot be primary. Restore the mailbox first.");
      }
      if (!row.isActive) throw new Error("Primary mailbox must be active.");

      await tx.clientMailboxIdentity.updateMany({
        where: { clientId, isPrimary: true },
        data: { isPrimary: false },
      });
      const next = await tx.clientMailboxIdentity.update({
        where: { id: row.id },
        data: { isPrimary: true },
      });

      await auditMailbox(staff.id, clientId, next.id, "UPDATE", {
        change: "primary",
        mailboxId: next.id,
        email: row.emailNormalized,
      });
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Save failed" };
  }

  revalidatePath(`/clients/${clientId}`);
  return { ok: true };
}

const removeFromWorkspaceSchema = z.object({
  clientId: z.string().min(1),
  mailboxId: z.string().min(1),
  note: z.string().max(2000).optional().nullable(),
});

export async function removeClientMailboxFromWorkspace(
  raw: z.infer<typeof removeFromWorkspaceSchema>,
): Promise<MailboxActionResult> {
  const staff = await requireOpensDoorsStaff();
  const data = removeFromWorkspaceSchema.safeParse(raw);
  if (!data.success) {
    return { ok: false, error: data.error.issues[0]?.message ?? "Invalid input" };
  }
  try {
    await requireClientMailboxMutator(staff, data.data.clientId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Forbidden" };
  }

  const noteTrim = data.data.note?.trim() || null;
  const clientId = data.data.clientId;
  const mailboxId = data.data.mailboxId;

  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.clientMailboxIdentity.findFirst({
        where: { id: mailboxId, clientId },
      });
      if (!existing) {
        throw new Error("Mailbox not found.");
      }
      if (isMailboxRemovedFromWorkspace(existing)) {
        throw new Error("This mailbox is already removed from the workspace.");
      }

      await tx.mailboxSendReservation.updateMany({
        where: { mailboxIdentityId: existing.id, status: "RESERVED" },
        data: { status: "RELEASED" },
      });

      await tx.mailboxIdentitySecret.deleteMany({ where: { mailboxIdentityId: existing.id } });

      const wasPrimary = existing.isPrimary;

      if (wasPrimary) {
        await tx.clientMailboxIdentity.updateMany({
          where: { clientId, isPrimary: true },
          data: { isPrimary: false },
        });
        const nextPrimary = await tx.clientMailboxIdentity.findFirst({
          where: {
            clientId,
            id: { not: existing.id },
            workspaceRemovedAt: null,
            isActive: true,
            connectionStatus: "CONNECTED",
            canSend: true,
            isSendingEnabled: true,
          },
          orderBy: { emailNormalized: "asc" },
        });
        if (nextPrimary) {
          await tx.clientMailboxIdentity.update({
            where: { id: nextPrimary.id },
            data: { isPrimary: true },
          });
        }
      }

      await tx.clientMailboxIdentity.update({
        where: { id: existing.id },
        data: {
          workspaceRemovedAt: new Date(),
          workspaceRemovedById: staff.id,
          workspaceRemovedNote: noteTrim,
          isActive: false,
          isPrimary: false,
          isSendingEnabled: false,
          canSend: false,
          canReceive: false,
          connectionStatus: "DISCONNECTED",
          oauthState: null,
          oauthStateExpiresAt: null,
          providerLinkedUserId: null,
          connectedAt: null,
        },
      });

      await tx.auditLog.create({
        data: {
          staffUserId: staff.id,
          clientId,
          action: "UPDATE",
          entityType: "ClientMailboxIdentity",
          entityId: existing.id,
          metadata: {
            kind: "mailbox_workspace_removed",
            email: existing.emailNormalized,
            provider: existing.provider,
            wasPrimary,
            note: noteTrim,
          } as Prisma.InputJsonValue,
        },
      });
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Remove failed" };
  }

  revalidatePath(`/clients/${clientId}`);
  revalidatePath(`/clients/${clientId}/mailboxes`);
  return { ok: true };
}

const restoreToWorkspaceSchema = z.object({
  clientId: z.string().min(1),
  mailboxId: z.string().min(1),
});

export async function restoreClientMailboxToWorkspace(
  raw: z.infer<typeof restoreToWorkspaceSchema>,
): Promise<MailboxActionResult> {
  const staff = await requireOpensDoorsStaff();
  const data = restoreToWorkspaceSchema.safeParse(raw);
  if (!data.success) {
    return { ok: false, error: data.error.issues[0]?.message ?? "Invalid input" };
  }
  try {
    await requireClientMailboxMutator(staff, data.data.clientId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Forbidden" };
  }

  const clientId = data.data.clientId;
  const mailboxId = data.data.mailboxId;

  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.clientMailboxIdentity.findFirst({
        where: { id: mailboxId, clientId },
      });
      if (!existing) {
        throw new Error("Mailbox not found.");
      }
      if (!isMailboxRemovedFromWorkspace(existing)) {
        throw new Error("This mailbox is not removed. Nothing to restore.");
      }

      const otherActive = await tx.clientMailboxIdentity.count({
        where: {
          clientId,
          isActive: true,
          workspaceRemovedAt: null,
          id: { not: existing.id },
        },
      });
      assertActiveMailboxLimit(otherActive, true);

      await tx.clientMailboxIdentity.update({
        where: { id: existing.id },
        data: {
          workspaceRemovedAt: null,
          workspaceRemovedById: null,
          workspaceRemovedNote: null,
          isActive: true,
          canSend: true,
          canReceive: true,
          isSendingEnabled: true,
          connectionStatus: "DISCONNECTED",
        },
      });

      await tx.auditLog.create({
        data: {
          staffUserId: staff.id,
          clientId,
          action: "UPDATE",
          entityType: "ClientMailboxIdentity",
          entityId: existing.id,
          metadata: {
            kind: "mailbox_workspace_restored",
            email: existing.emailNormalized,
            provider: existing.provider,
          } as Prisma.InputJsonValue,
        },
      });
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Restore failed" };
  }

  revalidatePath(`/clients/${clientId}`);
  revalidatePath(`/clients/${clientId}/mailboxes`);
  return { ok: true };
}
