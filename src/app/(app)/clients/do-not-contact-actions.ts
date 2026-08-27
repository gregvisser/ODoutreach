"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { normalizeManualDncEntry } from "@/lib/suppression/manual-dnc";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { getClientEmailSequenceMutationAllowed } from "@/server/email-sequences/mutator-access";
import { releaseReplyClaims } from "@/server/inbox/reply-claim";
import { requireClientAccess } from "@/server/tenant/access";
import { refreshContactSuppressionFlagsForClient } from "@/server/outreach/suppression-guard";
import {
  normalizeFamilyDomain,
  normalizeFamilyLabel,
} from "@/server/suppression/domain-families";
import {
  persistProposalPlans,
  planClientFamilyProposals,
} from "@/server/suppression/family-discovery-run";
import {
  confirmFamilyProposal,
  rejectFamilyProposal,
} from "@/server/suppression/family-proposals";

const schema = z.object({
  clientId: z.string().min(1),
  kind: z.enum(["EMAIL", "DOMAIN"]),
  value: z.string().min(1).max(320),
  /**
   * Set only when the button was pressed from a reply detail page. Suppressing
   * from there is one of the three ways of "acting on" a reply, so it clears
   * the advisory claim. Absent everywhere else (the global suppression page,
   * the DNC tab), where there is no reply to release.
   */
  replyClaimSubjectType: z.enum(["INBOUND_MESSAGE", "INBOUND_REPLY"]).optional(),
  replyClaimSubjectId: z.string().min(1).optional(),
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

  // Pressed from a reply detail page: somebody has acted, so the advisory
  // "X is looking at this" marker goes. Who suppressed it is recorded
  // permanently in the audit row above.
  const { replyClaimSubjectType, replyClaimSubjectId } = parsed.data;
  if (replyClaimSubjectType && replyClaimSubjectId) {
    await releaseReplyClaims({
      clientId,
      subject: {
        subjectType: replyClaimSubjectType,
        subjectId: replyClaimSubjectId,
      },
    });
  }

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

/* -------------------------------------------------------------------------
 * AUTOMATIC related-domain detection — the operator's route to it.
 *
 * The detection itself (`family-discovery-run.ts`, `family-proposals.ts`) was
 * built, migrated and tested on 2026-08-24 and then had no caller but an ops
 * script and no screen at all, so in practice the only way to record a related
 * domain was to type it by hand. These three actions are the missing wiring.
 *
 * The division of labour is deliberate and unchanged:
 *   - discovery WRITES QUESTIONS (`PENDING` proposals). It cannot block a send.
 *   - confirming is the ONLY path from a machine guess to something the send
 *     gate reads, and it is a human clicking. RULING 3 stands.
 *   - rejecting is a permanent tombstone, so a later run cannot re-ask.
 *
 * Nothing here can send an email. Confirming only ever blocks more mail.
 * ------------------------------------------------------------------------- */

async function requireFamilyProposalAccess(
  clientId: string,
): Promise<{ ok: true; staffId: string } | { ok: false; error: string }> {
  const staff = await requireOpensDoorsStaff();
  if (!clientId) return { ok: false, error: "Invalid form." };
  try {
    await requireClientAccess(staff, clientId);
  } catch {
    return { ok: false, error: "Access denied." };
  }
  if (!(await getClientEmailSequenceMutationAllowed(staff, clientId))) {
    return {
      ok: false,
      error:
        "You do not have permission to change the do-not-contact list for this client.",
    };
  }
  return { ok: true, staffId: staff.id };
}

export type FamilyProposalDecisionResult =
  | { ok: true; proposedDomain: string; contactsFlagged: number }
  | { ok: false; error: string };

/**
 * "Yes, same company" — promote a machine-found link to a real family member.
 *
 * The cached `Contact.isSuppressed` flags are refreshed afterwards for the same
 * reason `addDomainToFamilyAction` does it: the send gate re-reads families on
 * every send regardless, but if the screen still showed those contacts as
 * sendable the operator would be looking at a lie.
 */
export async function confirmFamilyProposalAction(input: {
  clientId: string;
  proposalId: string;
}): Promise<FamilyProposalDecisionResult> {
  const clientId = String(input?.clientId ?? "");
  const proposalId = String(input?.proposalId ?? "");
  const access = await requireFamilyProposalAccess(clientId);
  if (!access.ok) return access;
  if (!proposalId) return { ok: false, error: "Invalid form." };

  const result = await confirmFamilyProposal({
    clientId,
    proposalId,
    staffUserId: access.staffId,
  });
  if (!result.ok) return result;

  const refresh = await refreshContactSuppressionFlagsForClient(clientId);

  await prisma.auditLog.create({
    data: {
      staffUserId: access.staffId,
      clientId,
      action: "CREATE",
      entityType: "SuppressedDomainFamily",
      entityId: proposalId,
      metadata: {
        kind: "domain_family_proposal_confirmed",
        proposedDomain: result.proposedDomain,
        contactsSuppressedAfter: refresh.suppressed,
      },
    },
  });

  revalidatePath(`/clients/${clientId}/suppression`);
  revalidatePath("/suppression");
  return {
    ok: true,
    proposedDomain: result.proposedDomain,
    contactsFlagged: refresh.suppressed,
  };
}

/** "No, different company" — final, and recorded so it is never asked again. */
export async function rejectFamilyProposalAction(input: {
  clientId: string;
  proposalId: string;
}): Promise<FamilyProposalDecisionResult> {
  const clientId = String(input?.clientId ?? "");
  const proposalId = String(input?.proposalId ?? "");
  const access = await requireFamilyProposalAccess(clientId);
  if (!access.ok) return access;
  if (!proposalId) return { ok: false, error: "Invalid form." };

  const result = await rejectFamilyProposal({
    clientId,
    proposalId,
    staffUserId: access.staffId,
  });
  if (!result.ok) return result;

  await prisma.auditLog.create({
    data: {
      staffUserId: access.staffId,
      clientId,
      action: "UPDATE",
      entityType: "SuppressedDomainFamilyProposal",
      entityId: proposalId,
      metadata: {
        kind: "domain_family_proposal_rejected",
        proposedDomain: result.proposedDomain,
      },
    },
  });

  revalidatePath(`/clients/${clientId}/suppression`);
  revalidatePath("/suppression");
  return { ok: true, proposedDomain: result.proposedDomain, contactsFlagged: 0 };
}

export type DiscoverFamilyProposalsResult =
  | { ok: true; created: number; refreshed: number; contactDomainsChecked: number }
  | { ok: false; error: string };

/**
 * "Find related domains now" — read every contact domain's published DNS and
 * raise questions.
 *
 * There is a scheduled run as well (`/api/internal/suppression/discover-families`);
 * this exists so the answer to "has it looked at the list I just uploaded?" is
 * not "wait until tomorrow". It writes PENDING rows only, so pressing it can
 * never send, unsend, or block anything on its own.
 */
export async function discoverFamilyProposalsAction(input: {
  clientId: string;
}): Promise<DiscoverFamilyProposalsResult> {
  const clientId = String(input?.clientId ?? "");
  const access = await requireFamilyProposalAccess(clientId);
  if (!access.ok) return access;

  try {
    const plan = await planClientFamilyProposals({ clientId });
    const written = await persistProposalPlans({
      clientId,
      plans: plan.plans,
    });
    revalidatePath(`/clients/${clientId}/suppression`);
    return {
      ok: true,
      created: written.created,
      refreshed: written.refreshed,
      contactDomainsChecked: plan.contactDomainsChecked,
    };
  } catch (e) {
    // A DNS run that dies must say so. Reporting success on a run that found
    // nothing because it crashed is the failure this whole cycle is about.
    const msg = e instanceof Error ? e.message : "Could not check domains.";
    return { ok: false, error: `Could not finish the check: ${msg}` };
  }
}
