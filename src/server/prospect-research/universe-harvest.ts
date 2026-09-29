import "server-only";

import { extractDomainFromEmail } from "@/lib/normalize";
import { prisma } from "@/lib/db";
import { universeHarvestOrigin } from "@/lib/clients/rocketreach-origin";
import {
  classifyUniverseHarvestCandidate,
  type UniverseHarvestSkip,
} from "@/lib/clients/universe-harvest-provenance";
import { isEmailInCooldown, OUTREACH_COOLDOWN_DAYS } from "@/lib/email-sequences/recent-send-cooldown";
import { researchCriteriaSchema } from "@/lib/prospect-research/qualification";
import { universeMatchesResearchPlan } from "@/lib/prospect-research/universe-plan-match";
import { attachContactsToClientList } from "@/server/contacts/contact-lists";
import { evaluateSuppression } from "@/server/outreach/suppression-guard";
import { requireClientAccess, type StaffIdentity } from "@/server/tenant/access";

/** How many Universe rows one pass reads. The query is limited to this client's own sourcing. */
export const UNIVERSE_HARVEST_SCAN = 200;

/** How many people one pass may add. The scheduled job also stops at the list gap. */
export const UNIVERSE_HARVEST_BATCH = 50;

export type UniverseHarvestMatch = {
  universeId: string;
  name: string;
  title: string | null;
  employer: string | null;
  location: string | null;
  email: string;
  kind: "attach" | "create";
  contactId: string | null;
};

export type UniverseHarvestSkipped = Record<UniverseHarvestSkip, number>;

function emptySkipped(): UniverseHarvestSkipped {
  return { "no-email": 0, "no-match": 0, provenance: 0, "on-list": 0, enrolled: 0, suppressed: 0, cooldown: 0 };
}

function bump(skipped: UniverseHarvestSkipped, reason: UniverseHarvestSkip) {
  skipped[reason] += 1;
}

/**
 * Free matches from Universe for one plan.
 * Reads only rows this client sourced. Does not write, enrol, or send.
 */
export async function collectUniverseHarvest(args: {
  clientId: string;
  sequenceId: string;
  contactListId: string;
  criteria: unknown;
  now: Date;
  maxToAdd: number;
}): Promise<{ ok: true; matches: UniverseHarvestMatch[]; skipped: UniverseHarvestSkipped } | { ok: false; error: string }> {
  const criteria = researchCriteriaSchema.safeParse(args.criteria);
  if (!criteria.success) return { ok: false, error: "This research plan's targeting is incomplete." };
  const maxToAdd = Math.max(0, Math.min(UNIVERSE_HARVEST_BATCH, Math.trunc(args.maxToAdd)));
  const skipped = emptySkipped();
  if (maxToAdd === 0) return { ok: true, matches: [], skipped };

  const rows = await prisma.contactUniverse.findMany({
    where: {
      emailNormalized: { not: null },
      OR: [{ firstSeenClientId: args.clientId }, { sources: { some: { clientId: args.clientId } } }],
    },
    orderBy: { lastSeenAt: "desc" },
    take: UNIVERSE_HARVEST_SCAN,
    select: {
      id: true,
      emailNormalized: true,
      fullName: true,
      firstName: true,
      lastName: true,
      jobTitle: true,
      companyName: true,
      industry: true,
      location: true,
      city: true,
      country: true,
      firstSeenClientId: true,
      sources: { select: { clientId: true } },
    },
  });

  const emails = [...new Set(rows.flatMap((row) => (row.emailNormalized ? [row.emailNormalized] : [])))];
  const contacts = emails.length
    ? await prisma.contact.findMany({
        where: { clientId: args.clientId, email: { in: emails } },
        select: { id: true, email: true },
      })
    : [];
  const contactByEmail = new Map(contacts.flatMap((contact) => (contact.email ? [[contact.email.toLowerCase(), contact.id] as const] : [])));
  const contactIds = contacts.map((contact) => contact.id);
  const [members, enrollments, recentSends] = await Promise.all([
    contactIds.length
      ? prisma.contactListMember.findMany({
          where: { contactListId: args.contactListId, contactId: { in: contactIds } },
          select: { contactId: true },
        })
      : Promise.resolve([]),
    contactIds.length
      ? prisma.clientEmailSequenceEnrollment.findMany({
          where: { sequenceId: args.sequenceId, contactId: { in: contactIds } },
          select: { contactId: true },
        })
      : Promise.resolve([]),
    emails.length
      ? prisma.outboundEmail.findMany({
          where: {
            toEmail: { in: emails, mode: "insensitive" },
            sentAt: { gte: new Date(args.now.getTime() - OUTREACH_COOLDOWN_DAYS * 24 * 60 * 60 * 1000), not: null },
          },
          select: { toEmail: true, sentAt: true },
          orderBy: { sentAt: "desc" },
        })
      : Promise.resolve([]),
  ]);
  const onList = new Set(members.map((member) => member.contactId));
  const enrolled = new Set(enrollments.map((enrollment) => enrollment.contactId));
  const lastSent = new Map<string, Date>();
  for (const send of recentSends) {
    if (!send.toEmail || !send.sentAt) continue;
    const key = send.toEmail.trim().toLowerCase();
    if (!lastSent.has(key)) lastSent.set(key, send.sentAt);
  }

  const matches: UniverseHarvestMatch[] = [];
  for (const row of rows) {
    if (matches.length >= maxToAdd) break;
    const email = row.emailNormalized?.trim().toLowerCase() ?? "";
    const matchesPlan = universeMatchesResearchPlan(row, criteria.data);
    const existingContactId = email ? contactByEmail.get(email) ?? null : null;
    const decision = classifyUniverseHarvestCandidate({
      clientId: args.clientId,
      firstSeenClientId: row.firstSeenClientId,
      sourceClientIds: row.sources.flatMap((source) => (source.clientId ? [source.clientId] : [])),
      hasEmail: email.length > 0,
      matchesPlan,
      existingContactId,
      onList: existingContactId ? onList.has(existingContactId) : false,
      enrolled: existingContactId ? enrolled.has(existingContactId) : false,
      suppressed: false,
      inCooldown: email ? isEmailInCooldown(lastSent.get(email) ?? null, args.now) : false,
    });
    if (decision.action === "skip") {
      bump(skipped, decision.reason);
      continue;
    }
    const suppression = await evaluateSuppression(args.clientId, email, row.companyName);
    if (suppression.suppressed) {
      bump(skipped, "suppressed");
      continue;
    }
    matches.push({
      universeId: row.id,
      name: row.fullName?.trim() || [row.firstName, row.lastName].filter(Boolean).join(" ") || email,
      title: row.jobTitle,
      employer: row.companyName,
      location: row.location ?? row.city ?? row.country,
      email,
      kind: decision.action,
      contactId: decision.action === "attach" ? decision.contactId : null,
    });
  }
  return { ok: true, matches, skipped };
}

/**
 * Adds the free Universe matches to the sequence list.
 * New contacts are labelled as re-harvested. Existing contacts keep their origin.
 * This does not enrol and does not send.
 */
export async function applyUniverseHarvest(args: {
  clientId: string;
  sequenceId: string;
  contactListId: string;
  criteria: unknown;
  now: Date;
  maxToAdd: number;
  staffId: string | null;
}): Promise<
  | { ok: true; added: number; created: number; attached: number; matches: UniverseHarvestMatch[]; skipped: UniverseHarvestSkipped }
  | { ok: false; error: string }
> {
  const collected = await collectUniverseHarvest(args);
  if (!collected.ok) return collected;
  const origin = universeHarvestOrigin(args.now);
  const contactIds: string[] = [];
  let created = 0;
  let attached = 0;
  for (const match of collected.matches) {
    if (match.kind === "attach" && match.contactId) {
      contactIds.push(match.contactId);
      attached += 1;
      continue;
    }
    const row = await prisma.contactUniverse.findUnique({ where: { id: match.universeId } });
    if (!row?.emailNormalized) continue;
    const reuse = await prisma.contact.findUnique({
      where: { clientId_email: { clientId: args.clientId, email: row.emailNormalized } },
      select: { id: true },
    });
    if (reuse) {
      contactIds.push(reuse.id);
      attached += 1;
      continue;
    }
    const contact = await prisma.contact.create({
      data: {
        clientId: args.clientId,
        email: row.emailNormalized,
        emailDomain: extractDomainFromEmail(row.emailNormalized) || null,
        fullName: row.fullName,
        firstName: row.firstName,
        lastName: row.lastName,
        company: row.companyName,
        title: row.jobTitle,
        location: row.location,
        city: row.city,
        country: row.country,
        industry: row.industry,
        source: "MANUAL",
        originNote: origin,
        universeContactId: row.id,
      },
    });
    await prisma.contactUniverseSource.create({
      data: {
        universeContactId: row.id,
        clientId: args.clientId,
        sourceType: "MANUAL",
        sourceLabel: origin,
      },
    });
    contactIds.push(contact.id);
    created += 1;
  }
  const attachedResult = await attachContactsToClientList({
    clientId: args.clientId,
    contactListId: args.contactListId,
    contactIds,
    addedByStaffUserId: args.staffId,
  });
  return {
    ok: true,
    added: attachedResult.added,
    created,
    attached,
    matches: collected.matches,
    skipped: collected.skipped,
  };
}

async function sequencePlan(clientId: string, sequenceId: string, planId: string) {
  const sequence = await prisma.clientEmailSequence.findFirst({
    where: { id: sequenceId, clientId, archivedAt: null },
    select: { id: true, contactListId: true, contactList: { select: { archivedAt: true } } },
  });
  if (!sequence || sequence.contactList.archivedAt) return { ok: false as const, error: "That sequence's list is not available." };
  const plan = await prisma.prospectResearchPlan.findFirst({ where: { id: planId, clientId } });
  if (!plan) return { ok: false as const, error: "Choose a research plan saved on this client." };
  return { ok: true as const, sequence, plan };
}

/** Free preview. Nothing is added and no RocketReach credit is spent. */
export async function previewUniverseMatchesForSequence(
  staff: StaffIdentity,
  clientId: string,
  sequenceId: string,
  planId: string,
) {
  await requireClientAccess(staff, clientId);
  const loaded = await sequencePlan(clientId, sequenceId, planId);
  if (!loaded.ok) return loaded;
  const collected = await collectUniverseHarvest({
    clientId,
    sequenceId,
    contactListId: loaded.sequence.contactListId,
    criteria: loaded.plan.criteria,
    now: new Date(),
    maxToAdd: UNIVERSE_HARVEST_BATCH,
  });
  if (!collected.ok) return collected;
  return {
    ok: true as const,
    matches: collected.matches,
    detail: collected.matches.length
      ? `Universe has ${String(collected.matches.length)} ${collected.matches.length === 1 ? "match" : "matches"} for this plan. Nothing has been added. People sourced only for another client are not listed.`
      : "No Universe matches this client can add. People already on the list, people sourced only for another client, do-not-contact, and the 10-day cooldown are left out.",
  };
}

/** Adds the previewed free matches to the sequence list. Does not enrol or send. */
export async function addUniverseMatchesForSequence(
  staff: StaffIdentity,
  clientId: string,
  sequenceId: string,
  planId: string,
) {
  await requireClientAccess(staff, clientId);
  const loaded = await sequencePlan(clientId, sequenceId, planId);
  if (!loaded.ok) return loaded;
  const now = new Date();
  const applied = await applyUniverseHarvest({
    clientId,
    sequenceId,
    contactListId: loaded.sequence.contactListId,
    criteria: loaded.plan.criteria,
    now,
    maxToAdd: UNIVERSE_HARVEST_BATCH,
    staffId: staff.id,
  });
  if (!applied.ok) return applied;
  await prisma.rocketReachPlanRun.create({
    data: {
      clientId,
      planId,
      sequenceId,
      contactListId: loaded.sequence.contactListId,
      triggeredByStaffId: staff.id,
      trigger: "MANUAL",
      status: "COMPLETED",
      finishedAt: now,
      creditsUsed: 0,
      creditsReserved: 0,
      contactsAdded: applied.added,
      dryRun: false,
      skipped: applied.skipped,
      detail: `Find matches in Universe added ${String(applied.added)} (${String(applied.created)} new, ${String(applied.attached)} already held). No RocketReach credit was spent.`,
    },
  });
  return {
    ok: true as const,
    added: applied.added,
    created: applied.created,
    attached: applied.attached,
    detail: `Added ${String(applied.added)} to the list from Universe. ${String(applied.created)} ${applied.created === 1 ? "is" : "are"} new and labelled as re-harvested. No credit was spent. Nobody was enrolled and no email was sent.`,
  };
}
