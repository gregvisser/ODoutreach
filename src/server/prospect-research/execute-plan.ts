import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { formatStaffDateTime } from "@/lib/datetime/staff-datetime";
import { researchPlanToSearchBody } from "@/lib/prospect-research/plan-to-search";
import {
  runRocketReachListImport,
  type RocketReachListImportResult,
} from "@/server/integrations/rocketreach/run-import";
import type { RocketReachLookupGovernor } from "@/server/integrations/rocketreach/person-import";

export type ResearchPlanExecution = RocketReachListImportResult & { runId: string };

function skippedPayload(result: RocketReachListImportResult): Prisma.InputJsonValue {
  if (!result.ok) return { error: result.error };
  return {
    alreadyKnown: result.skippedAlreadyKnown,
    noEmail: result.skippedNoEmail,
    invalid: result.skippedInvalid,
    duplicate: result.skippedDuplicate,
    flaggedSuppressed: result.flaggedSuppressed,
    importedWithoutLookup: result.importedWithoutLookup,
    errors: result.errors,
  };
}

/**
 * Runs a saved research plan through the same RocketReach import path as the Sources card.
 * Dedupe and do-not-contact flagging stay in that path. This does not enrol or send.
 */
export async function executeSavedResearchPlan(args: {
  clientId: string;
  planId: string;
  staffId: string | null;
  existingListId?: string;
  newListName?: string;
  trigger: "MANUAL" | "AUTO_REFILL";
  sequenceId?: string | null;
  start?: number;
  pageSize?: number;
  originNote?: string | null;
  sourceLabel?: string | null;
  governorForRun?: (runId: string) => RocketReachLookupGovernor;
}): Promise<ResearchPlanExecution> {
  const plan = await prisma.prospectResearchPlan.findFirst({
    where: { id: args.planId, clientId: args.clientId },
  });
  if (!plan) return { ok: false, error: "That research plan is not on this client.", runId: "" };

  const cap = Math.min(plan.maxLookups, args.pageSize ?? plan.maxLookups);
  const mapped = researchPlanToSearchBody(plan.criteria, cap, args.start ?? 1);
  const run = await prisma.rocketReachPlanRun.create({
    data: {
      clientId: args.clientId,
      planId: plan.id,
      sequenceId: args.sequenceId ?? null,
      triggeredByStaffId: args.staffId,
      trigger: args.trigger,
      status: "RUNNING",
      skipped: mapped.ok ? {} : { error: mapped.error },
      dryRun: false,
    },
  });
  if (!mapped.ok) {
    await prisma.rocketReachPlanRun.update({
      where: { id: run.id },
      data: { status: "FAILED", finishedAt: new Date(), detail: mapped.error },
    });
    return { ok: false, error: mapped.error, runId: run.id };
  }

  let result: RocketReachListImportResult;
  try {
    result = await runRocketReachListImport({
      clientId: args.clientId,
      staffId: args.staffId,
      existingListId: args.existingListId,
      newListName: args.newListName,
      searchBody: mapped.body,
      originNote: args.originNote,
      sourceLabel: args.sourceLabel,
      governor: args.governorForRun?.(run.id),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "RocketReach import failed.";
    await prisma.rocketReachPlanRun.update({
      where: { id: run.id },
      data: { status: "FAILED", finishedAt: new Date(), detail: message, skipped: { error: message } },
    });
    return { ok: false, error: message, runId: run.id };
  }
  const creditsReserved = result.ok ? result.lookupsAttempted : 0;
  await prisma.rocketReachPlanRun.update({
    where: { id: run.id },
    data: {
      status: result.ok ? "COMPLETED" : "FAILED",
      finishedAt: new Date(),
      contactListId: result.ok ? result.contactListId : null,
      creditsReserved,
      creditsUsed: result.ok ? result.creditsUsed : 0,
      contactsAdded: result.ok ? result.imported : 0,
      skipped: skippedPayload(result),
      detail: result.ok
        ? `Added ${String(result.imported)}. Skipped already known ${String(result.skippedAlreadyKnown)}, no email ${String(result.skippedNoEmail)}, invalid ${String(result.skippedInvalid)}, duplicate ${String(result.skippedDuplicate)}.`
        : result.error,
    },
  });
  return { ...result, runId: run.id };
}

export async function listLatestManualPlanRunNotes(clientId: string): Promise<Record<string, string>> {
  const runs = await prisma.rocketReachPlanRun.findMany({
    where: { clientId, trigger: "MANUAL" },
    orderBy: { startedAt: "desc" },
    take: 40,
    select: {
      planId: true,
      startedAt: true,
      creditsUsed: true,
      contactsAdded: true,
      detail: true,
      triggeredBy: { select: { displayName: true, email: true } },
    },
  });
  const notes: Record<string, string> = {};
  for (const run of runs) {
    if (notes[run.planId]) continue;
    const who = run.triggeredBy?.displayName?.trim() || run.triggeredBy?.email || "a staff member";
    notes[run.planId] = `${who} on ${formatStaffDateTime(run.startedAt)}. Contacts added ${String(run.contactsAdded)}. Credits used ${String(run.creditsUsed)}. ${run.detail ?? ""}`.trim();
  }
  return notes;
}
