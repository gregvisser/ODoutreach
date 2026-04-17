"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { Prisma } from "@/generated/prisma/client";
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
const statusSchema = z.enum([
  "DRAFT",
  "PENDING_CONNECTION",
  "CONNECTED",
  "CONNECTION_ERROR",
  "DISCONNECTED",
]);

const baseFields = {
  displayName: z.string().max(200).optional().nullable(),
  connectionStatus: statusSchema,
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

  assertPrimaryRequiresActive(data.data.isPrimary, data.data.isActive);

  const now = new Date();
  const windowEnd = startOfNextUtcDay(now);

  try {
    await prisma.$transaction(async (tx) => {
      const activeCount = await tx.clientMailboxIdentity.count({
        where: { clientId: data.data.clientId, isActive: true },
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
          connectionStatus: data.data.connectionStatus,
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
        connectionStatus: data.data.connectionStatus,
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

      const activeCount = await tx.clientMailboxIdentity.count({
        where: {
          clientId: data.data.clientId,
          isActive: true,
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
          connectionStatus: data.data.connectionStatus,
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
          connectionStatus: existing.connectionStatus,
          isActive: existing.isActive,
          isPrimary: existing.isPrimary,
          isSendingEnabled: existing.isSendingEnabled,
          dailySendCap: existing.dailySendCap,
        },
        after: {
          connectionStatus: next.connectionStatus,
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
