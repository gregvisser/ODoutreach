"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { normalizeManualDncEntry } from "@/lib/suppression/manual-dnc";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { getClientEmailSequenceMutationAllowed } from "@/server/email-sequences/mutator-access";
import { requireClientAccess } from "@/server/tenant/access";
import { refreshContactSuppressionFlagsForClient } from "@/server/outreach/suppression-guard";
import {
  normalizeFamilyDomain,
  normalizeFamilyLabel,
} from "@/server/suppression/domain-families";

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

/* -------------------------------------------------------------------------
 * RULING 3 (Greg, 2026-08-24) — related-company domain families.
 *
 * A client says "do not contact BT" and gives bt.com. Someone at bteurope.com
 * is on the list. They must not be emailed. Membership is a LISTED FACT: a
 * human types "BT" and names the domains that belong to it. Nothing is
 * inferred, because bteurope.com shares no text with bt.com and any algorithm
 * connecting them would also connect things that are not related.
 *
 * SUPPRESSION BEHAVIOUR, stated plainly because both options were defensible
 * and the screen must not imply the other one:
 *   - The SEND-PATH gate is authoritative. `evaluateSuppression` re-reads
 *     families on every send, so adding bteurope.com to the BT family blocks
 *     prospects that were already loaded months ago. That is the case that
 *     actually happens, since clients hand over updated sheets weekly.
 *   - AND adding a member immediately refreshes `Contact.isSuppressed` for the
 *     client, so the lists and counts on screen agree with what the gate will
 *     do. Without that the UI would show a contact as sendable while the gate
 *     silently refused it, which is the worse of the two failures.
 * ------------------------------------------------------------------------- */

const familySchema = z.object({
  clientId: z.string().min(1),
  label: z.string().min(1).max(80),
  domain: z.string().min(1).max(253),
});

export type DomainFamilyResult =
  | { ok: true; label: string; domain: string; contactsFlagged: number; blocking: boolean }
  | { ok: false; error: string };

export async function addDomainToFamilyAction(
  input: z.infer<typeof familySchema>,
): Promise<DomainFamilyResult> {
  const staff = await requireOpensDoorsStaff();
  const parsed = familySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid form." };
  const { clientId } = parsed.data;

  try {
    await requireClientAccess(staff, clientId);
  } catch {
    return { ok: false, error: "Access denied." };
  }
  if (!(await getClientEmailSequenceMutationAllowed(staff, clientId))) {
    return {
      ok: false,
      error: "You do not have permission to change the do-not-contact list for this client.",
    };
  }

  const label = normalizeFamilyLabel(parsed.data.label);
  if (!label.ok) return { ok: false, error: label.error };
  const domain = normalizeFamilyDomain(parsed.data.domain);
  if (!domain.ok) return { ok: false, error: domain.error };

  const existing = await prisma.suppressedDomainFamily.findUnique({
    where: { clientId_domain: { clientId, domain: domain.domain } },
  });
  if (existing && existing.label !== label.label) {
    return {
      ok: false,
      error: `${domain.domain} is already listed under "${existing.label}". Remove it there first — a domain can only belong to one company.`,
    };
  }

  const row = await prisma.suppressedDomainFamily.upsert({
    where: { clientId_domain: { clientId, domain: domain.domain } },
    create: {
      clientId,
      label: label.label,
      domain: domain.domain,
      createdByStaffUserId: staff.id,
    },
    update: { label: label.label },
  });

  // Recompute cached flags so the screen agrees with the gate. The gate does
  // not depend on this — it re-reads families on every send.
  const refresh = await refreshContactSuppressionFlagsForClient(clientId);

  // Is this family actually blocking anything yet? A family whose members are
  // none of them suppressed is listed but inert, and the operator must be told.
  const members = await prisma.suppressedDomainFamily.findMany({
    where: { clientId, label: label.label },
    select: { domain: true },
  });
  const suppressedMembers = await prisma.suppressedDomain.count({
    where: { clientId, domain: { in: members.map((m) => m.domain) } },
  });

  await prisma.auditLog.create({
    data: {
      staffUserId: staff.id,
      action: "CREATE",
      entityType: "SuppressedDomainFamily",
      entityId: row.id,
      metadata: {
        kind: "domain_family_add",
        label: label.label,
        domain: domain.domain,
        blocking: suppressedMembers > 0,
        contactsSuppressedAfter: refresh.suppressed,
        triggeredBy: staff.email,
      },
    },
  });

  revalidatePath(`/clients/${clientId}/suppression`);
  revalidatePath("/suppression");

  return {
    ok: true,
    label: label.label,
    domain: domain.domain,
    contactsFlagged: refresh.suppressed,
    blocking: suppressedMembers > 0,
  };
}

export async function removeDomainFromFamilyAction(input: {
  clientId: string;
  id: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const staff = await requireOpensDoorsStaff();
  const clientId = String(input?.clientId ?? "");
  const id = String(input?.id ?? "");
  if (!clientId || !id) return { ok: false, error: "Invalid form." };

  try {
    await requireClientAccess(staff, clientId);
  } catch {
    return { ok: false, error: "Access denied." };
  }
  if (!(await getClientEmailSequenceMutationAllowed(staff, clientId))) {
    return { ok: false, error: "You do not have permission to change this list." };
  }

  // Scoped by clientId as well as id — never delete another workspace's row.
  const row = await prisma.suppressedDomainFamily.findFirst({
    where: { id, clientId },
  });
  if (!row) return { ok: false, error: "That entry no longer exists." };

  await prisma.suppressedDomainFamily.delete({ where: { id: row.id } });
  await refreshContactSuppressionFlagsForClient(clientId);

  await prisma.auditLog.create({
    data: {
      staffUserId: staff.id,
      action: "DELETE",
      entityType: "SuppressedDomainFamily",
      entityId: row.id,
      metadata: {
        kind: "domain_family_remove",
        label: row.label,
        domain: row.domain,
        triggeredBy: staff.email,
      },
    },
  });

  revalidatePath(`/clients/${clientId}/suppression`);
  revalidatePath("/suppression");
  return { ok: true };
}
