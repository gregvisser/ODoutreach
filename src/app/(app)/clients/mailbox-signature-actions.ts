"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import {
  htmlSignatureToText,
  normaliseSignatureHtml,
} from "@/lib/mailboxes/sender-signature";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { requireClientMailboxMutator } from "@/server/mailbox-identities/mutator-access";
import { syncGmailSignatureForMailbox } from "@/server/mailbox/gmail-signature-sync";

/**
 * Per-mailbox sender signature server actions (PR — mailbox sender
 * signatures, 2026-04-22). Two actions:
 *
 *   * `syncMailboxSignatureAction(clientId, mailboxId)` — Google only;
 *     reads `users.settings.sendAs` and persists the chosen entry.
 *   * `updateMailboxSignatureAction({ ... })` — manual edit.
 *
 * Safety:
 *   * Staff + client-mailbox-mutator access required.
 *   * Mailbox must belong to the client.
 *   * NEVER sends email, reconnects OAuth, or changes anything beyond
 *     the six `senderSignature*` / `senderDisplayName` columns on the
 *     `ClientMailboxIdentity` row.
 *   * Microsoft rows short-circuit the sync path with an
 *     `unsupported_provider` message — we don't even call Graph.
 */

export type MailboxSignatureActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

const updateSchema = z.object({
  clientId: z.string().min(1),
  mailboxId: z.string().min(1),
  senderDisplayName: z.string().max(200).optional().nullable(),
  signatureHtml: z.string().max(20_000).optional().nullable(),
  signatureText: z.string().max(20_000).optional().nullable(),
});

async function auditMailboxSignature(
  staffUserId: string,
  clientId: string,
  mailboxId: string,
  action: "UPDATE",
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

async function assertMailboxBelongsToClient(
  clientId: string,
  mailboxId: string,
) {
  const row = await prisma.clientMailboxIdentity.findFirst({
    where: { id: mailboxId, clientId },
    select: {
      id: true,
      clientId: true,
      email: true,
      emailNormalized: true,
      provider: true,
      connectionStatus: true,
    },
  });
  if (!row) {
    throw new Error("Mailbox not found for this client.");
  }
  return row;
}

export async function syncMailboxSignatureAction(
  clientId: string,
  mailboxId: string,
): Promise<MailboxSignatureActionResult> {
  const staff = await requireOpensDoorsStaff();
  try {
    await requireClientMailboxMutator(staff, clientId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Forbidden" };
  }

  let mailbox;
  try {
    mailbox = await assertMailboxBelongsToClient(clientId, mailboxId);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Mailbox not found.",
    };
  }

  if (mailbox.provider === "MICROSOFT") {
    // Record the unsupported state so operators see a stable badge.
    await prisma.clientMailboxIdentity.update({
      where: { id: mailbox.id },
      data: {
        senderSignatureSource: "unsupported_provider",
        senderSignatureSyncError:
          "Outlook signature sync is not available through the supported Microsoft Graph mailbox API. Add a manual signature for this mailbox.",
      },
    });
    revalidatePath(`/clients/${clientId}/mailboxes`);
    return {
      ok: false,
      error:
        "Outlook signature sync is not available through the supported Microsoft Graph mailbox API. Add a manual signature for this mailbox.",
    };
  }

  if (mailbox.connectionStatus !== "CONNECTED") {
    return {
      ok: false,
      error:
        "Connect this mailbox first — signature sync needs a valid OAuth token.",
    };
  }

  const result = await syncGmailSignatureForMailbox({
    mailboxIdentityId: mailbox.id,
    mailboxEmail: mailbox.emailNormalized,
  });

  if (!result.ok) {
    await prisma.clientMailboxIdentity.update({
      where: { id: mailbox.id },
      data: { senderSignatureSyncError: result.message },
    });
    await auditMailboxSignature(staff.id, clientId, mailbox.id, "UPDATE", {
      change: "signature_sync_failed",
      code: result.code,
      message: result.message,
    });
    revalidatePath(`/clients/${clientId}/mailboxes`);
    return { ok: false, error: result.message };
  }

  const nextDisplay = result.displayName?.trim() || null;
  const nextHtml = result.signatureHtml;
  const nextText =
    result.signatureText ??
    (nextHtml ? htmlSignatureToText(nextHtml) : "") ??
    "";
  const nextTextNormalised = nextText.length > 0 ? nextText : null;

  await prisma.clientMailboxIdentity.update({
    where: { id: mailbox.id },
    data: {
      senderDisplayName: nextDisplay,
      senderSignatureHtml: nextHtml,
      senderSignatureText: nextTextNormalised,
      senderSignatureSource: "gmail_send_as",
      senderSignatureSyncedAt: new Date(),
      senderSignatureSyncError: null,
    },
  });

  await auditMailboxSignature(staff.id, clientId, mailbox.id, "UPDATE", {
    change: "signature_sync_succeeded",
    selection: result.selection,
    matchedEmail: result.matchedEmail,
    hasSignature: nextHtml !== null || nextTextNormalised !== null,
  });

  revalidatePath(`/clients/${clientId}/mailboxes`);
  return {
    ok: true,
    message: nextTextNormalised
      ? "Signature synced from Gmail."
      : "Synced — Gmail returned no signature for this sendAs entry.",
  };
}

export async function updateMailboxSignatureAction(
  raw: z.infer<typeof updateSchema>,
): Promise<MailboxSignatureActionResult> {
  const staff = await requireOpensDoorsStaff();
  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  try {
    await requireClientMailboxMutator(staff, parsed.data.clientId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Forbidden" };
  }

  let mailbox;
  try {
    mailbox = await assertMailboxBelongsToClient(
      parsed.data.clientId,
      parsed.data.mailboxId,
    );
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Mailbox not found.",
    };
  }

  const senderDisplayName = parsed.data.senderDisplayName?.trim() || null;
  const htmlInput = parsed.data.signatureHtml?.trim() || null;
  const textInput = parsed.data.signatureText?.trim() || null;

  const nextHtml = htmlInput ? normaliseSignatureHtml(htmlInput) : "";
  const derivedText = nextHtml ? htmlSignatureToText(nextHtml) : "";

  // If the caller sent text-only, keep it as-is. If HTML was sent, use
  // its text rendering; operator-typed text still wins when both are
  // present.
  const nextText = textInput ?? (derivedText.length > 0 ? derivedText : null);

  const hasAnySignature =
    (nextHtml && nextHtml.length > 0) ||
    (nextText !== null && nextText.length > 0);

  await prisma.clientMailboxIdentity.update({
    where: { id: mailbox.id },
    data: {
      senderDisplayName,
      senderSignatureHtml: nextHtml && nextHtml.length > 0 ? nextHtml : null,
      senderSignatureText: nextText,
      senderSignatureSource: hasAnySignature
        ? "manual"
        : mailbox.provider === "MICROSOFT"
          ? "unsupported_provider"
          : null,
      senderSignatureSyncedAt: hasAnySignature ? new Date() : null,
      senderSignatureSyncError: null,
    },
  });

  await auditMailboxSignature(
    staff.id,
    parsed.data.clientId,
    mailbox.id,
    "UPDATE",
    {
      change: "signature_manual_update",
      hasDisplayName: senderDisplayName !== null,
      hasSignature: hasAnySignature,
    },
  );

  revalidatePath(`/clients/${parsed.data.clientId}/mailboxes`);
  return { ok: true, message: "Signature updated." };
}
