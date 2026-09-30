import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { automaticSourceOrigin } from "@/lib/clients/rocketreach-origin";
import {
  clientAllowsListRefill,
  decideListRefill,
  effectiveBalanceFloor,
  isRocketReachAutoRefillEnabled,
  listNeedsPeople,
  parseOptionalCreditFloor,
  sequenceRefillRuleInputSchema,
  type SequenceRefillRuleInput,
} from "@/lib/clients/rocketreach-refill-policy";
import type { SequenceListTopUpView } from "@/lib/clients/rocketreach-top-up-view";
import {
  previewMaySearchRocketReach,
  rocketReachPersonSearchCostsCredits,
} from "@/lib/clients/rocketreach-credit-estimate";
import {
  researchPlanToPreviewSearch,
  ROCKETREACH_PLAN_EMPTY_SEARCH_MESSAGE,
} from "@/lib/prospect-research/plan-to-search";
import { loadRocketReachCreditSnapshot } from "@/server/integrations/rocketreach/account";
import {
  searchRocketReachIdentities,
  type RocketReachLookupGovernor,
} from "@/server/integrations/rocketreach/person-import";
import { loadKnownRocketReachIndexes } from "@/server/integrations/rocketreach/known-profiles";
import { matchKnownSearchProfile } from "@/lib/clients/rocketreach-known-match";
import { executeSavedResearchPlan } from "@/server/prospect-research/execute-plan";
import { applyUniverseHarvest, collectUniverseHarvest, UNIVERSE_HARVEST_BATCH } from "@/server/prospect-research/universe-harvest";
import { requireClientAccess, type StaffIdentity } from "@/server/tenant/access";

const ACTIVE_RESERVATION = ["RESERVED", "CHARGED"] as const;

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function startOfUtcMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

async function reservedSince(ruleId: string, since: Date): Promise<number> {
  return prisma.rocketReachCreditReservation.count({
    where: { ruleId, state: { in: [...ACTIVE_RESERVATION] }, reservedAt: { gte: since } },
  });
}

export async function countReadyNotEnrolled(
  clientId: string,
  sequenceId: string,
  contactListId: string,
): Promise<number> {
  const members = await prisma.contactListMember.findMany({
    where: {
      clientId,
      contactListId,
      contact: { email: { not: null }, isSuppressed: false },
    },
    select: { contactId: true },
  });
  if (members.length === 0) return 0;
  const enrolled = await prisma.clientEmailSequenceEnrollment.count({
    where: { sequenceId, contactId: { in: members.map((member) => member.contactId) } },
  });
  return Math.max(0, members.length - enrolled);
}

function creditGovernor(args: {
  runId: string;
  ruleId: string;
  clientId: string;
  maxPerRun: number;
  maxPerDay: number;
  maxPerMonth: number;
  floor: number;
  remaining: { value: number | "unlimited" };
  now: Date;
}): RocketReachLookupGovernor {
  return {
    reserve: async (profileId) =>
      prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "SequenceListRefillRule" WHERE id = ${args.ruleId} FOR UPDATE`;
        if (args.remaining.value !== "unlimited" && args.remaining.value <= args.floor) {
          return { proceed: false, reason: "The RocketReach balance is at the floor, so no further lookup was made." };
        }
        const profileKey = String(profileId);
        const existing = await tx.rocketReachCreditReservation.findUnique({
          where: { runId_profileId: { runId: args.runId, profileId: profileKey } },
        });
        if (existing) return { proceed: false, reason: "This profile was already reserved for this run." };
        const runUsed = await tx.rocketReachCreditReservation.count({
          where: { runId: args.runId, state: { in: [...ACTIVE_RESERVATION] } },
        });
        if (runUsed >= args.maxPerRun) return { proceed: false, reason: "This run's credit budget is used." };
        const dayUsed = await tx.rocketReachCreditReservation.count({
          where: { ruleId: args.ruleId, state: { in: [...ACTIVE_RESERVATION] }, reservedAt: { gte: startOfUtcDay(args.now) } },
        });
        if (dayUsed >= args.maxPerDay) return { proceed: false, reason: "Today's credit budget is used." };
        const monthUsed = await tx.rocketReachCreditReservation.count({
          where: { ruleId: args.ruleId, state: { in: [...ACTIVE_RESERVATION] }, reservedAt: { gte: startOfUtcMonth(args.now) } },
        });
        if (monthUsed >= args.maxPerMonth) return { proceed: false, reason: "This month's credit budget is used." };
        await tx.rocketReachCreditReservation.create({
          data: {
            clientId: args.clientId,
            runId: args.runId,
            ruleId: args.ruleId,
            profileId: profileKey,
            state: "RESERVED",
          },
        });
        return { proceed: true };
      }),
    settle: async (profileId, outcome) => {
      const state = outcome === "charged" ? "CHARGED" : outcome === "released" ? "RELEASED" : "RESERVED";
      await prisma.rocketReachCreditReservation.updateMany({
        where: { runId: args.runId, profileId: String(profileId), state: "RESERVED" },
        data: { state, resolvedAt: outcome === "kept" ? null : new Date() },
      });
      if (outcome !== "released" && typeof args.remaining.value === "number") {
        args.remaining.value -= 1;
      }
    },
  };
}

async function recordSkip(args: {
  clientId: string;
  planId: string;
  sequenceId: string;
  reason: string;
}): Promise<void> {
  await prisma.rocketReachPlanRun.create({
    data: {
      clientId: args.clientId,
      planId: args.planId,
      sequenceId: args.sequenceId,
      trigger: "AUTO_REFILL",
      status: "SKIPPED",
      finishedAt: new Date(),
      skipped: { reason: args.reason },
      detail: args.reason,
      dryRun: false,
    },
  });
}

export async function runDueRocketReachListRefills(now = new Date()): Promise<{
  failed: number;
  errors: string[];
  processed: number;
  skipped: number;
  refilled: number;
  killSwitch: "off" | "on";
}> {
  if (!isRocketReachAutoRefillEnabled(process.env.ROCKETREACH_AUTO_REFILL)) {
    return { failed: 0, errors: [], processed: 0, skipped: 0, refilled: 0, killSwitch: "off" };
  }
  const floorEnv = parseOptionalCreditFloor(process.env.ROCKETREACH_MIN_CREDIT_FLOOR);
  const rules = await prisma.sequenceListRefillRule.findMany({
    where: { enabled: true },
    orderBy: { updatedAt: "asc" },
    take: 20,
    include: {
      client: { select: { status: true, deletedAt: true, autonomousSendEnabled: true } },
      sequence: { select: { id: true, clientId: true, contactListId: true, archivedAt: true, contactList: { select: { archivedAt: true } } } },
      plan: { select: { id: true, name: true, clientId: true, criteria: true } },
    },
  });
  const balance = await loadRocketReachCreditSnapshot({ force: true, now: now.getTime() });
  const remaining: { value: number | "unlimited" } = {
    value: balance.state === "ready" ? balance.remaining : 0,
  };
  let failed = 0;
  let skipped = 0;
  let refilled = 0;
  const errors: string[] = [];
  for (const rule of rules) {
    const readyBefore = await countReadyNotEnrolled(rule.clientId, rule.sequenceId, rule.sequence.contactListId);
    const need = listNeedsPeople({
      killSwitchOn: true,
      client: rule.client,
      sequenceArchived: rule.sequence.archivedAt !== null,
      listArchived: rule.sequence.contactList.archivedAt !== null,
      planBelongsToClient: rule.plan.clientId === rule.clientId && rule.sequence.clientId === rule.clientId,
      readyNotEnrolled: readyBefore,
      lowWaterMark: rule.lowWaterMark,
      floorEnvInvalid: floorEnv === "invalid",
    });
    if (need.action === "skip") {
      skipped++;
      await recordSkip({
        clientId: rule.clientId,
        planId: rule.planId,
        sequenceId: rule.sequenceId,
        reason: need.reason,
      });
      continue;
    }
    let universeAdded = 0;
    let universeDetail = "";
    try {
      const harvested = await applyUniverseHarvest({
        clientId: rule.clientId,
        sequenceId: rule.sequenceId,
        contactListId: rule.sequence.contactListId,
        criteria: rule.plan.criteria,
        now,
        maxToAdd: need.gap,
        staffId: null,
      });
      if (!harvested.ok) {
        failed++;
        errors.push(harvested.error);
        continue;
      }
      universeAdded = harvested.added;
      universeDetail = harvested.added
        ? `Universe added ${String(harvested.added)} (${String(harvested.created)} new, ${String(harvested.attached)} already held by this client). `
        : "";
    } catch (error) {
      failed++;
      errors.push(error instanceof Error ? error.message : "Universe re-harvest failed.");
      continue;
    }
    const readyAfter = await countReadyNotEnrolled(rule.clientId, rule.sequenceId, rule.sequence.contactListId);
    const decision = decideListRefill({
      killSwitchOn: true,
      client: rule.client,
      sequenceArchived: rule.sequence.archivedAt !== null,
      listArchived: rule.sequence.contactList.archivedAt !== null,
      planBelongsToClient: true,
      readyNotEnrolled: readyAfter,
      lowWaterMark: rule.lowWaterMark,
      balance:
        balance.state === "ready"
          ? { ok: true, remaining: remaining.value }
          : { ok: false, reason: "RocketReach credit balance is unavailable, so no lookup was made." },
      balanceFloor: effectiveBalanceFloor(rule.balanceFloor, floorEnv === "invalid" ? null : floorEnv),
      creditsReservedToday: await reservedSince(rule.id, startOfUtcDay(now)),
      creditsReservedThisMonth: await reservedSince(rule.id, startOfUtcMonth(now)),
      maxCreditsPerRun: rule.maxCreditsPerRun,
      maxCreditsPerDay: rule.maxCreditsPerDay,
      maxCreditsPerMonth: rule.maxCreditsPerMonth,
      floorEnvInvalid: floorEnv === "invalid",
    });
    if (decision.action === "skip") {
      if (universeAdded > 0) {
        await prisma.rocketReachPlanRun.create({
          data: {
            clientId: rule.clientId,
            planId: rule.planId,
            sequenceId: rule.sequenceId,
            contactListId: rule.sequence.contactListId,
            trigger: "AUTO_REFILL",
            status: "COMPLETED",
            finishedAt: new Date(),
            creditsUsed: 0,
            creditsReserved: 0,
            contactsAdded: universeAdded,
            skipped: { universeAdded },
            detail: `${universeDetail}No RocketReach lookup. ${decision.reason}`,
            dryRun: false,
          },
        });
        refilled++;
      } else {
        skipped++;
        await recordSkip({
          clientId: rule.clientId,
          planId: rule.planId,
          sequenceId: rule.sequenceId,
          reason: decision.reason,
        });
      }
      continue;
    }
    const origin = automaticSourceOrigin(rule.plan.name, now);
    const floor = effectiveBalanceFloor(rule.balanceFloor, floorEnv === "invalid" ? null : floorEnv);
    try {
      const result = await executeSavedResearchPlan({
        clientId: rule.clientId,
        planId: rule.planId,
        staffId: null,
        existingListId: rule.sequence.contactListId,
        trigger: "AUTO_REFILL",
        sequenceId: rule.sequenceId,
        start: rule.searchStart,
        pageSize: decision.lookupBudget,
        originNote: origin,
        sourceLabel: origin,
        governorForRun: (runId) =>
          creditGovernor({
            runId,
            ruleId: rule.id,
            clientId: rule.clientId,
            maxPerRun: rule.maxCreditsPerRun,
            maxPerDay: rule.maxCreditsPerDay,
            maxPerMonth: rule.maxCreditsPerMonth,
            floor,
            remaining,
            now,
          }),
      });
      const emptySearch = result.ok
        ? result.imported === 0 && result.searchProfileCount === 0
        : /no profile ids|no matches for this plan/i.test(result.error);
      if (emptySearch) {
        skipped++;
        if (result.runId) {
          await prisma.rocketReachPlanRun.update({
            where: { id: result.runId },
            data: { status: "SKIPPED", detail: "No further RocketReach profiles matched this plan." },
          });
        }
        if (rule.searchStart > 1) {
          await prisma.sequenceListRefillRule.update({ where: { id: rule.id }, data: { searchStart: 1 } });
        }
      } else if (result.ok) {
        if (universeDetail && result.runId) {
          await prisma.rocketReachPlanRun.update({
            where: { id: result.runId },
            data: {
              contactsAdded: result.imported + universeAdded,
              detail: `${universeDetail}RocketReach added ${String(result.imported)}.`,
            },
          });
        }
        const nextStart = result.searchProfileCount < decision.lookupBudget ? 1 : rule.searchStart + result.searchProfileCount;
        await prisma.sequenceListRefillRule.update({
          where: { id: rule.id },
          data: { searchStart: Math.max(1, nextStart) },
        });
        refilled++;
      } else {
        failed++;
        errors.push(result.error);
      }
    } catch (error) {
      failed++;
      const message = error instanceof Error ? error.message : "List top-up failed.";
      errors.push(message);
    }
  }
  return { failed, errors, processed: rules.length, skipped, refilled, killSwitch: "on" };
}

export async function saveSequenceListRefillRule(
  staff: StaffIdentity,
  clientId: string,
  input: SequenceRefillRuleInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireClientAccess(staff, clientId);
  const parsed = sequenceRefillRuleInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the top-up settings." };
  const value = parsed.data;
  const sequence = await prisma.clientEmailSequence.findFirst({
    where: { id: value.sequenceId, clientId, archivedAt: null },
    select: { id: true, contactListId: true },
  });
  if (!sequence) return { ok: false, error: "That sequence is not on this client." };
  const plan = await prisma.prospectResearchPlan.findFirst({
    where: { id: value.planId, clientId },
    select: { id: true },
  });
  if (!plan) return { ok: false, error: "Choose a research plan saved on this client." };
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const existing = await tx.sequenceListRefillRule.findUnique({ where: { sequenceId: sequence.id } });
    const data = {
      clientId,
      planId: plan.id,
      enabled: value.enabled,
      lowWaterMark: value.lowWaterMark,
      maxCreditsPerRun: value.maxCreditsPerRun,
      maxCreditsPerDay: value.maxCreditsPerDay,
      maxCreditsPerMonth: value.maxCreditsPerMonth,
      balanceFloor: value.balanceFloor,
      enabledByStaffId: value.enabled ? staff.id : existing?.enabledByStaffId ?? staff.id,
      enabledAt: value.enabled ? now : existing?.enabledAt ?? null,
      disabledAt: value.enabled ? null : now,
    };
    const saved = existing
      ? await tx.sequenceListRefillRule.update({ where: { id: existing.id }, data })
      : await tx.sequenceListRefillRule.create({ data: { ...data, sequenceId: sequence.id } });
    await tx.auditLog.create({
      data: {
        clientId,
        staffUserId: staff.id,
        action: existing ? "UPDATE" : "CREATE",
        entityType: "SequenceListRefillRule",
        entityId: saved.id,
        metadata: {
          sequenceId: sequence.id,
          planId: plan.id,
          enabled: value.enabled,
          lowWaterMark: value.lowWaterMark,
          maxCreditsPerRun: value.maxCreditsPerRun,
          maxCreditsPerDay: value.maxCreditsPerDay,
          maxCreditsPerMonth: value.maxCreditsPerMonth,
          balanceFloor: value.balanceFloor,
          enrolsContacts: false,
          sendsEmail: false,
        } satisfies Prisma.InputJsonObject,
      },
    });
  });
  return { ok: true };
}

export async function previewSequenceListTopUp(
  staff: StaffIdentity,
  clientId: string,
  sequenceId: string,
  planId: string,
): Promise<
  | {
      ok: true;
      matches: { name: string; title: string | null; employer: string | null; location: string | null; wouldLookup: boolean; source: "Universe" | "RocketReach" }[];
      estimatedCredits: number;
      alreadyKnown: number;
      universeMatches: number;
      detail: string;
    }
  | { ok: false; error: string }
> {
  await requireClientAccess(staff, clientId);
  const sequence = await prisma.clientEmailSequence.findFirst({
    where: { id: sequenceId, clientId },
    select: { id: true, contactListId: true, contactList: { select: { archivedAt: true } } },
  });
  if (!sequence || sequence.contactList.archivedAt) return { ok: false, error: "That sequence's list is not available." };
  const plan = await prisma.prospectResearchPlan.findFirst({ where: { id: planId, clientId } });
  if (!plan) return { ok: false, error: "Choose a research plan saved on this client." };
  const rule = await prisma.sequenceListRefillRule.findUnique({ where: { sequenceId } });
  const ready = await countReadyNotEnrolled(clientId, sequenceId, sequence.contactListId);
  const universeCap = rule ? Math.max(0, rule.lowWaterMark - ready) : UNIVERSE_HARVEST_BATCH;
  const universe = await collectUniverseHarvest({
    clientId,
    sequenceId,
    contactListId: sequence.contactListId,
    criteria: plan.criteria,
    now: new Date(),
    maxToAdd: universeCap,
  });
  if (!universe.ok) return universe;
  const mapped = researchPlanToPreviewSearch(plan.criteria, rule?.maxCreditsPerRun ?? Math.min(plan.maxLookups, 10), rule?.searchStart ?? 1);
  if (!mapped.ok) return mapped;
  const searchCostsCredits = rocketReachPersonSearchCostsCredits();
  let searchNote = "";
  const searched = !mapped.body
    ? { ok: true as const, identities: [] }
    : previewMaySearchRocketReach(searchCostsCredits)
      ? await searchRocketReachIdentities(mapped.body)
      : { ok: true as const, identities: [] };
  if (!searched.ok) return searched;
  if (mapped.body && !previewMaySearchRocketReach(searchCostsCredits)) {
    searchNote = "Preview did not search RocketReach because a search would spend credits.";
  } else if (mapped.body && searched.identities.length === 0) {
    searchNote = ROCKETREACH_PLAN_EMPTY_SEARCH_MESSAGE;
  }
  const pageSize = mapped.body?.page_size ?? 0;
  const known = await loadKnownRocketReachIndexes(clientId, searched.identities);
  const rocketReachMatches = searched.identities.map((identity) => {
    const hit = matchKnownSearchProfile(identity, known);
    return {
      name: identity.name ?? `RocketReach profile ${String(identity.id)}`,
      title: identity.title,
      employer: identity.employer,
      location: identity.location,
      wouldLookup: hit === null,
      source: "RocketReach" as const,
    };
  });
  const alreadyKnown = rocketReachMatches.filter((match) => !match.wouldLookup).length;
  const unknown = rocketReachMatches.length - alreadyKnown;
  const gap = rule ? Math.max(0, rule.lowWaterMark - ready) : Math.max(0, unknown - ready);
  const shortfall = Math.max(0, gap - universe.matches.length);
  const estimatedCredits = shortfall === 0 ? 0 : Math.min(unknown, pageSize, shortfall);
  const matches = [
    ...universe.matches.map((match) => ({
      name: match.name,
      title: match.title,
      employer: match.employer,
      location: match.location,
      wouldLookup: false,
      source: "Universe" as const,
    })),
    ...rocketReachMatches,
  ];
  await prisma.rocketReachPlanRun.create({
    data: {
      clientId,
      planId: plan.id,
      sequenceId,
      contactListId: sequence.contactListId,
      triggeredByStaffId: staff.id,
      trigger: "PREVIEW",
      status: "PREVIEW",
      finishedAt: new Date(),
      creditsUsed: 0,
      creditsReserved: 0,
      contactsAdded: 0,
      dryRun: true,
      skipped: { alreadyKnown, wouldLookup: unknown, universeMatches: universe.matches.length },
      detail: [`Preview only. Universe ${String(universe.matches.length)}. RocketReach lookups about ${String(estimatedCredits)}. No lookup was made.`, searchNote, mapped.note].filter(Boolean).join(" "),
    },
  });
  return {
    ok: true,
    matches,
    estimatedCredits,
    alreadyKnown,
    universeMatches: universe.matches.length,
    detail: [`Preview only. Universe can add ${String(universe.matches.length)} without credits. RocketReach would look up about ${String(estimatedCredits)} credit${estimatedCredits === 1 ? "" : "s"} for the shortfall. ${String(alreadyKnown)} RocketReach ${alreadyKnown === 1 ? "row is" : "rows are"} already known. No contact was added and no credit was spent.`, searchNote, mapped.note].filter(Boolean).join(" "),
  };
}

export async function loadSequenceListTopUp(
  clientId: string,
  sequenceId: string,
): Promise<SequenceListTopUpView | null> {
  const sequence = await prisma.clientEmailSequence.findFirst({
    where: { id: sequenceId, clientId },
    select: {
      id: true,
      contactListId: true,
      contactList: { select: { name: true, archivedAt: true } },
      client: { select: { status: true, deletedAt: true, autonomousSendEnabled: true } },
    },
  });
  if (!sequence) return null;
  const [plans, rule, lastRun, readyNotEnrolled] = await Promise.all([
    prisma.prospectResearchPlan.findMany({
      where: { clientId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, name: true },
    }),
    prisma.sequenceListRefillRule.findUnique({
      where: { sequenceId },
      include: { enabledBy: { select: { displayName: true, email: true } } },
    }),
    prisma.rocketReachPlanRun.findFirst({
      where: { sequenceId },
      orderBy: { startedAt: "desc" },
    }),
    countReadyNotEnrolled(clientId, sequenceId, sequence.contactListId),
  ]);
  const now = new Date();
  const creditsUsedToday = rule ? await reservedSince(rule.id, startOfUtcDay(now)) : 0;
  const creditsUsedThisMonth = rule ? await reservedSince(rule.id, startOfUtcMonth(now)) : 0;
  const clientGate = clientAllowsListRefill(sequence.client);
  return {
    sequenceId,
    listName: sequence.contactList.name,
    killSwitchOn: isRocketReachAutoRefillEnabled(process.env.ROCKETREACH_AUTO_REFILL),
    clientAllows: clientGate.ok,
    clientBlockReason: clientGate.ok ? null : clientGate.reason,
    readyNotEnrolled,
    plans,
    rule: rule
      ? {
          planId: rule.planId,
          enabled: rule.enabled,
          lowWaterMark: rule.lowWaterMark,
          maxCreditsPerRun: rule.maxCreditsPerRun,
          maxCreditsPerDay: rule.maxCreditsPerDay,
          maxCreditsPerMonth: rule.maxCreditsPerMonth,
          balanceFloor: rule.balanceFloor,
          enabledByName: rule.enabledBy?.displayName?.trim() || rule.enabledBy?.email || null,
          enabledAt: rule.enabledAt?.toISOString() ?? null,
        }
      : null,
    lastRun: lastRun
      ? {
          status: lastRun.status,
          trigger: lastRun.trigger,
          finishedAt: (lastRun.finishedAt ?? lastRun.startedAt).toISOString(),
          creditsUsed: lastRun.creditsUsed,
          contactsAdded: lastRun.contactsAdded,
          detail: lastRun.detail,
        }
      : null,
    creditsUsedToday,
    creditsUsedThisMonth,
    budgetLeftToday: rule ? Math.max(0, rule.maxCreditsPerDay - creditsUsedToday) : null,
    budgetLeftThisMonth: rule ? Math.max(0, rule.maxCreditsPerMonth - creditsUsedThisMonth) : null,
  };
}
