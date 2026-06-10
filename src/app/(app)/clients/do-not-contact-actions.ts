"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { normalizeManualDncEntry } from "@/lib/suppression/manual-dnc";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { getClientEmailSequenceMutationAllowed } from "@/server/email-sequences/mutator-access";
import { requireClientAccess } from "@/server/tenant/access";

const schema = z.object({
  clientId: z.string().min(1),
  kind: z.enum(["EMAIL", "DOMAIN"]),
  value: z.string().min(1).max(320),
});

export type AddToDoNotContactResult =
  | { ok: true; kind: "EMAIL" | "DOMAIN"; value: string; alreadyListed: boolean; contactsFlagged: number }
  | { ok: false; error: string };

/**
 * In-app "Add to do-not-contact" — writes the suppression row DIRECTLY to
 * the database, so the block is enforced on the very next send attempt
 * (the dispatcher re-reads SuppressedEmail/SuppressedDomain at send time).
 * No Google Sheet round-trip, no waiting for the scheduled sheet sync.
 *
 * Rows are written with `sourceId: null` so the scheduled sheet re-sync
 * (which replaces only its own source's rows) can never delete a manual
 * entry. Affected contacts are flagged immediately so lists/planning UIs
 * reflect the block without waiting for the next full refresh.
 */
export async function addToDoNotContactAction(
  input: z.infer<typeof schema>,
): Promise<AddToDoNotContactResult> {
  const staff = await requireOpensDoorsStaff();
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid do-not-contact form." };
  }
  const { clientId, kind } = parsed.data;

  try {
    await requireClientAccess(staff, clientId);
  } catch {
    return { ok: false, error: "Access denied." };
  }
  // Read-only roles can see the button's surface but must not mutate.
  if (!(await getClientEmailSequenceMutationAllowed(staff, clientId))) {
    return {
      ok: false,
      error: "You do not have permission to change the do-not-contact list for this client.",
    };
  }

  const normalized = normalizeManualDncEntry(kind, parsed.data.value);
  if (!normalized.ok) {
    return { ok: false, error: normalized.error };
  }

  const now = new Date();
  let alreadyListed = false;
  let entityId: string;

  if (normalized.kind === "EMAIL") {
    const existing = await prisma.suppressedEmail.findUnique({
      where: { clientId_email: { clientId, email: normalized.value } },
      select: { id: true },
    });
    alreadyListed = existing !== null;
    const row =
      existing ??
      (await prisma.suppressedEmail.create({
        data: { clientId, email: normalized.value, sourceId: null },
        select: { id: true },
      }));
    entityId = row.id;
  } else {
    const existing = await prisma.suppressedDomain.findUnique({
      where: { clientId_domain: { clientId, domain: normalized.value } },
      select: { id: true },
    });
    alreadyListed = existing !== null;
    const row =
      existing ??
      (await prisma.suppressedDomain.create({
        data: { clientId, domain: normalized.value, sourceId: null },
        select: { id: true },
      }));
    entityId = row.id;
  }

  // Flag matching contacts right away so planning UIs and recipient lists
  // show "Suppressed" without waiting for the next full refresh. The
  // send-time gate reads the tables (above), so sends are blocked even
  // before this completes.
  const contactWhere =
    normalized.kind === "EMAIL"
      ? { clientId, email: { equals: normalized.value, mode: "insensitive" as const } }
      : { clientId, email: { endsWith: `@${normalized.value}`, mode: "insensitive" as const } };
  const flagged = await prisma.contact.updateMany({
    where: contactWhere,
    data: { isSuppressed: true, lastSuppressionCheckAt: now },
  });

  await prisma.auditLog.create({
    data: {
      staffUserId: staff.id,
      clientId,
      action: "CREATE",
      entityType: normalized.kind === "EMAIL" ? "SuppressedEmail" : "SuppressedDomain",
      entityId,
      metadata: {
        kind: "manual_do_not_contact_add",
        value: normalized.value,
        alreadyListed,
        contactsFlagged: flagged.count,
        triggeredBy: staff.email,
      },
    },
  });

  revalidatePath(`/clients/${clientId}/suppression`);
  revalidatePath(`/clients/${clientId}/activity`);
  revalidatePath("/suppression");

  return {
    ok: true,
    kind: normalized.kind,
    value: normalized.value,
    alreadyListed,
    contactsFlagged: flagged.count,
  };
}
