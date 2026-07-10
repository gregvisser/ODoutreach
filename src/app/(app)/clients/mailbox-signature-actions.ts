"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import {
  htmlSignatureToText,
  normaliseSignatureHtml,
} from "@/lib/mailboxes/sender-signature";
import { isMailboxRemovedFromWorkspace } from "@/lib/mailbox-workspace-removal";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { requireClientMailboxMutator } from "@/server/mailbox-identities/mutator-access";
import { syncGmailSignatureForMailbox } from "@/server/mailbox/gmail-signature-sync";
import {
  buildOpensDoorsBrandedSignatureHtml,
  buildOpensDoorsBrandedSignaturePlain,
  humanizeEmailLocalPart,
} from "@/lib/mailboxes/opensdoors-branded-signature-template";
import {
  brandedSignatureNeedsNameBackfill,
  DEFAULT_SIGNATURE_DISCLAIMER,
} from "@/lib/mailboxes/branded-signature-backfill";

/** The client's brand fields (already trimmed to non-empty or null). */
type BrandedSignatureClientBrand = {
  name: string;
  website: string | null;
  logoUrl: string | null;
  companyPhone: string | null;
};

/** The per-mailbox fields the branded signature is built from. */
type BrandedSignatureMailbox = {
  email: string;
  displayName: string | null;
  senderDisplayName: string | null;
  senderPhone: string | null;
};

/**
 * Build the branded HTML + plain signature for one mailbox from the client's
 * brand. Shared by the one-click "set" and the "regenerate" actions so both
 * always produce an identical, named signature.
 *
 * `realName` prefers an explicit name, then the mailbox display name, then a
 * human name derived from the email local-part (charlie@ → "Charlie") so the
 * signature and the From header always carry a person, never the raw address.
 */
function buildBrandedSignatureForMailbox(
  client: BrandedSignatureClientBrand,
  mailbox: BrandedSignatureMailbox,
): { realName: string | null; html: string | null; plain: string | null } {
  const realName =
    mailbox.senderDisplayName?.trim() ||
    mailbox.displayName?.trim() ||
    humanizeEmailLocalPart(mailbox.email) ||
    null;
  // Per-mailbox number wins; otherwise the client company landline.
  const phone = mailbox.senderPhone?.trim() || client.companyPhone;
  const templateInput = {
    // Pass the email through as a last resort; the template de-dupes it against
    // the mailto line so it still only appears once.
    displayName: realName ?? mailbox.email,
    email: mailbox.email,
    phone,
    website: client.website,
    legalDisclaimer: DEFAULT_SIGNATURE_DISCLAIMER,
    logoUrl: client.logoUrl,
    logoAlt: client.name,
  };
  const html = normaliseSignatureHtml(
    buildOpensDoorsBrandedSignatureHtml(templateInput),
  );
  const plain = buildOpensDoorsBrandedSignaturePlain(templateInput);
  return {
    realName,
    html: html.length > 0 ? html : null,
    plain: plain.trim() || null,
  };
}

/**
 * Per-mailbox sender signature server actions (PR — mailbox sender
 * signatures, 2026-04-22). Two actions:
 *
 *   * `syncMailboxSignatureAction(clientId, mailboxId)` — Google only;
 *     reads `users.settings.sendAs` and persists the chosen entry.
 *   * `updateMailboxSignatureAction({ ... })` — manual edit.
 *
 * Safety:
 *   * Client-mailbox-mutator access required (every active staff member with
 *     access to the client — the OpensDoors team manages its own signatures).
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
  senderPhone: z.string().max(60).optional().nullable(),
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
      workspaceRemovedAt: true,
    },
  });
  if (!row) {
    throw new Error("Mailbox not found for this client.");
  }
  if (isMailboxRemovedFromWorkspace(row)) {
    throw new Error(
      "This mailbox was removed from the workspace. Restore it first if you need to change signatures or sync from Gmail.",
    );
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
      senderPhone: parsed.data.senderPhone?.trim() || null,
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

/**
 * One-click "set once per client": give every connected mailbox that has NO
 * signature yet a branded signature built from the CLIENT's own brand (name,
 * website and logo from its brief) plus that mailbox's display name + email.
 *
 * Non-destructive on purpose — a mailbox that already has a signature is
 * skipped, never overwritten, so this can be run safely at any time and never
 * clobbers a hand-tuned signature. Microsoft and Google mailboxes are treated
 * identically (the signature is appended by the send pipeline regardless of
 * provider). Staff never have to write HTML.
 */
export async function applyBrandedSignatureToAllClientMailboxesAction(
  clientId: string,
): Promise<MailboxSignatureActionResult> {
  const staff = await requireOpensDoorsStaff();
  try {
    await requireClientMailboxMutator(staff, clientId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Forbidden" };
  }

  const client = await prisma.client.findFirst({
    where: { id: clientId, deletedAt: null },
    select: { id: true, name: true, website: true, logoUrl: true, signaturePhone: true },
  });
  if (!client) {
    return { ok: false, error: "Client not found." };
  }

  // Connected, in-workspace mailboxes with NO signature yet. The WHERE clause
  // is the non-destructive guard: rows that already have a signature never come
  // back, so they are never touched.
  const mailboxes = await prisma.clientMailboxIdentity.findMany({
    where: {
      clientId,
      workspaceRemovedAt: null,
      connectionStatus: "CONNECTED",
      senderSignatureHtml: null,
      senderSignatureText: null,
    },
    select: {
      id: true,
      email: true,
      displayName: true,
      senderDisplayName: true,
      senderPhone: true,
    },
  });

  if (mailboxes.length === 0) {
    return {
      ok: true,
      message: "Every connected mailbox already has a signature — nothing to add.",
    };
  }

  const brand: BrandedSignatureClientBrand = {
    name: client.name,
    website: client.website?.trim() || null,
    logoUrl: client.logoUrl?.trim() || null,
    companyPhone: client.signaturePhone?.trim() || null,
  };

  let applied = 0;
  for (const mb of mailboxes) {
    const built = buildBrandedSignatureForMailbox(brand, mb);
    await prisma.clientMailboxIdentity.update({
      where: { id: mb.id },
      data: {
        senderDisplayName: built.realName,
        senderSignatureHtml: built.html,
        senderSignatureText: built.plain,
        senderSignatureSource: "manual",
        senderSignatureSyncedAt: new Date(),
        senderSignatureSyncError: null,
      },
    });
    await auditMailboxSignature(staff.id, clientId, mb.id, "UPDATE", {
      change: "signature_branded_bulk_apply",
      hasSignature: true,
    });
    applied += 1;
  }

  revalidatePath(`/clients/${clientId}/mailboxes`);
  return {
    ok: true,
    message:
      applied === 1
        ? "Added a branded signature to 1 mailbox. Open Preview signature to see how it looks."
        : `Added a branded signature to ${applied} mailboxes. Open Preview signature on any row to see how it looks.`,
  };
}

/**
 * Refresh existing branded signatures that were generated before the "derive a
 * sender name from the email" fix (they came out nameless — a logo, the email
 * and the website but no person). Rebuilds each affected signature so it now
 * shows the sender's name and persists that name to `senderDisplayName`.
 *
 * Safe to run any time: it only rewrites OUR auto-generated, still-nameless
 * signatures (`senderSignatureSource === "manual"` + our confidentiality footer
 * + no name line — see `brandedSignatureNeedsNameBackfill`). A Gmail-synced
 * signature, a hand-written one, or one that already shows a name is left
 * untouched. Never sends mail or changes anything beyond the signature columns.
 */
export async function regenerateBrandedSignaturesForClientAction(
  clientId: string,
): Promise<MailboxSignatureActionResult> {
  const staff = await requireOpensDoorsStaff();
  try {
    await requireClientMailboxMutator(staff, clientId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Forbidden" };
  }

  const client = await prisma.client.findFirst({
    where: { id: clientId, deletedAt: null },
    select: {
      id: true,
      name: true,
      website: true,
      logoUrl: true,
      signaturePhone: true,
    },
  });
  if (!client) {
    return { ok: false, error: "Client not found." };
  }

  // Connected, in-workspace mailboxes whose signature we set ("manual"). We then
  // keep only the still-nameless auto-generated ones; everything else is
  // filtered out per-row by brandedSignatureNeedsNameBackfill.
  const mailboxes = await prisma.clientMailboxIdentity.findMany({
    where: {
      clientId,
      workspaceRemovedAt: null,
      connectionStatus: "CONNECTED",
      senderSignatureSource: "manual",
    },
    select: {
      id: true,
      email: true,
      displayName: true,
      senderDisplayName: true,
      senderPhone: true,
      senderSignatureHtml: true,
      senderSignatureText: true,
      senderSignatureSource: true,
    },
  });

  const brand: BrandedSignatureClientBrand = {
    name: client.name,
    website: client.website?.trim() || null,
    logoUrl: client.logoUrl?.trim() || null,
    companyPhone: client.signaturePhone?.trim() || null,
  };

  let regenerated = 0;
  for (const mb of mailboxes) {
    const built = buildBrandedSignatureForMailbox(brand, mb);
    if (
      !brandedSignatureNeedsNameBackfill({
        source: mb.senderSignatureSource,
        html: mb.senderSignatureHtml,
        text: mb.senderSignatureText,
        resolvedName: built.realName,
      })
    ) {
      continue;
    }

    await prisma.clientMailboxIdentity.update({
      where: { id: mb.id },
      data: {
        senderDisplayName: built.realName,
        senderSignatureHtml: built.html,
        senderSignatureText: built.plain,
        senderSignatureSource: "manual",
        senderSignatureSyncedAt: new Date(),
        senderSignatureSyncError: null,
      },
    });
    await auditMailboxSignature(staff.id, clientId, mb.id, "UPDATE", {
      change: "signature_branded_regenerate",
      hasSignature: true,
    });
    regenerated += 1;
  }

  revalidatePath(`/clients/${clientId}/mailboxes`);
  if (regenerated === 0) {
    return {
      ok: true,
      message:
        "Nothing to refresh — every branded signature already shows the sender's name (hand-written signatures are left untouched).",
    };
  }
  return {
    ok: true,
    message:
      regenerated === 1
        ? "Refreshed 1 branded signature so it now shows the sender's name. Open Preview signature to check."
        : `Refreshed ${regenerated} branded signatures so they now show the sender's name. Open Preview signature on any row to check.`,
  };
}

/**
 * Set (or clear) the client's company landline shown in outreach signatures.
 * This is the default the one-click branded signature uses for every mailbox
 * that has no number of its own. Does not touch existing signatures — re-run
 * "Set branded signatures" (or edit a mailbox) to apply a changed number.
 */
export async function setClientSignaturePhoneAction(
  clientId: string,
  phone: string | null,
): Promise<MailboxSignatureActionResult> {
  const staff = await requireOpensDoorsStaff();
  try {
    await requireClientMailboxMutator(staff, clientId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Forbidden" };
  }

  const client = await prisma.client.findFirst({
    where: { id: clientId, deletedAt: null },
    select: { id: true },
  });
  if (!client) {
    return { ok: false, error: "Client not found." };
  }

  const value = phone?.trim().slice(0, 60) || null;
  await prisma.client.update({
    where: { id: clientId },
    data: { signaturePhone: value },
  });
  revalidatePath(`/clients/${clientId}/mailboxes`);
  return {
    ok: true,
    message: value
      ? "Company landline saved. Press “Set branded signatures” to apply it to mailboxes."
      : "Company landline cleared.",
  };
}
