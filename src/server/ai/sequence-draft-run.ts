import "server-only";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

import { AI_SEQUENCE_DRAFTING_CALL_TIMEOUT_MS } from "./anthropic-messages";
import { draftSequenceForClient } from "./draft-sequence";
import {
  SEQUENCE_DRAFT_INTERRUPTED_MESSAGE,
  sequenceDraftFailureMessage,
  sequenceDraftSuccessMessage,
} from "./sequence-draft-messages";

/**
 * Detach "Write a sequence with AI" from the browser request.
 *
 * The button used to be a server action that awaited the xAI call and only
 * then redirected, with no catch around the action. Three clocks fell out of
 * that:
 *
 *   * Under a second: a throw before `redirect()` (auth, access, the template
 *     mutator, a missing id, or Prisma in `loadBrief`) became a failed action.
 *     `error.tsx` hid the message. The same screen appears immediately when
 *     the POST comes back as HTML or as an unrecognised action, because the
 *     client never receives `x-action-redirect`.
 *   * About 25–30s: the silent POST was cut before `redirect()`. Same
 *     `error.tsx`. The model call might still have been running.
 *   * About 80–90s: when the POST survived, `AbortSignal.timeout` of
 *     {@link AI_SEQUENCE_DRAFTING_CALL_TIMEOUT_MS} fired inside the metered
 *     call, the failure was caught, and the page redirected to the
 *     "temporarily unavailable" banner. That is the only path that reached
 *     the banner.
 *
 * Lengthening the abort does not help the first two clocks, and a second
 * automatic call would bill a timeout that may already have been served. The
 * action records a row and returns. Throws before that redirect become the
 * start-failed banner. `after()` runs the existing one-shot drafter once the
 * response has closed. The templates page polls the row. The button also
 * catches an action rejection so a non-RSC response stays on the card.
 *
 * Reply classification is unchanged and still uses the short timeout.
 */

/** Extra time after the model abort for the row to be marked finished. */
export const SEQUENCE_DRAFT_RUN_GRACE_MS = 30_000;

const ACTIVE_STATUSES = ["QUEUED", "RUNNING"] as const;

export function sequenceDraftRunDeadlineMs(): number {
  return AI_SEQUENCE_DRAFTING_CALL_TIMEOUT_MS + SEQUENCE_DRAFT_RUN_GRACE_MS;
}

export function isSequenceDraftRunStale(
  run: { status: string; startedAt: Date | null; createdAt: Date },
  now: Date,
): boolean {
  if (run.status !== "QUEUED" && run.status !== "RUNNING") return false;
  const anchor = run.startedAt ?? run.createdAt;
  return now.getTime() - anchor.getTime() > sequenceDraftRunDeadlineMs();
}

function isUniqueConflict(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === "P2002"
  );
}

/** Queue the one model call until the server-action response has been sent. */
export function scheduleSequenceDraftRun(runId: string): void {
  after(() => executeSequenceDraftRun(runId));
}

const terminalPatch = {
  activeClientId: null,
} as const;

export async function expireStaleSequenceDraftRuns(args: {
  clientId: string;
  now?: Date;
}): Promise<number> {
  const now = args.now ?? new Date();
  const cutoff = new Date(now.getTime() - sequenceDraftRunDeadlineMs());
  const expired = await prisma.aiSequenceDraftRun.updateMany({
    where: {
      clientId: args.clientId,
      status: { in: [...ACTIVE_STATUSES] },
      OR: [
        { startedAt: { lt: cutoff } },
        { AND: [{ startedAt: null }, { createdAt: { lt: cutoff } }] },
      ],
    },
    data: {
      status: "FAILED",
      reason: "sequence_draft_interrupted",
      message: SEQUENCE_DRAFT_INTERRUPTED_MESSAGE,
      finishedAt: now,
      ...terminalPatch,
    },
  });
  return expired.count;
}

export async function beginSequenceDraftRun(args: {
  clientId: string;
  staffUserId: string;
  now?: Date;
  /** Tests pass this so they do not need a Next.js request scope. */
  schedule?: (runId: string) => void;
}): Promise<{ runId: string; alreadyRunning: boolean }> {
  const now = args.now ?? new Date();
  const schedule = args.schedule ?? scheduleSequenceDraftRun;
  await expireStaleSequenceDraftRuns({ clientId: args.clientId, now });

  try {
    const run = await prisma.aiSequenceDraftRun.create({
      data: {
        clientId: args.clientId,
        requestedByStaffUserId: args.staffUserId,
        status: "QUEUED",
        activeClientId: args.clientId,
      },
      select: { id: true },
    });
    schedule(run.id);
    return { runId: run.id, alreadyRunning: false };
  } catch (err) {
    if (!isUniqueConflict(err)) throw err;
    const existing = await prisma.aiSequenceDraftRun.findFirst({
      where: {
        clientId: args.clientId,
        status: { in: [...ACTIVE_STATUSES] },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (!existing) throw err;
    return { runId: existing.id, alreadyRunning: true };
  }
}

export type SequenceDraftRunView = {
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
  message: string | null;
};

export async function readSequenceDraftRun(args: {
  clientId: string;
  runId: string;
  now?: Date;
}): Promise<SequenceDraftRunView | null> {
  const now = args.now ?? new Date();
  const run = await prisma.aiSequenceDraftRun.findFirst({
    where: { id: args.runId, clientId: args.clientId },
  });
  if (!run) return null;
  if (!isSequenceDraftRunStale(run, now)) {
    return { status: run.status, message: run.message };
  }

  const expired = await prisma.aiSequenceDraftRun.updateMany({
    where: { id: run.id, status: { in: [...ACTIVE_STATUSES] } },
    data: {
      status: "FAILED",
      reason: "sequence_draft_interrupted",
      message: SEQUENCE_DRAFT_INTERRUPTED_MESSAGE,
      finishedAt: now,
      ...terminalPatch,
    },
  });
  if (expired.count === 1) {
    return { status: "FAILED", message: SEQUENCE_DRAFT_INTERRUPTED_MESSAGE };
  }

  const again = await prisma.aiSequenceDraftRun.findFirst({
    where: { id: args.runId, clientId: args.clientId },
    select: { status: true, message: true },
  });
  if (!again) return null;
  return { status: again.status, message: again.message };
}

async function finishRun(args: {
  runId: string;
  status: "SUCCEEDED" | "FAILED";
  reason: string | null;
  message: string;
  templateIds: readonly string[];
}): Promise<void> {
  await prisma.aiSequenceDraftRun.updateMany({
    where: { id: args.runId, status: "RUNNING" },
    data: {
      status: args.status,
      reason: args.reason,
      message: args.message,
      templateIds: [...args.templateIds],
      finishedAt: new Date(),
      ...terminalPatch,
    },
  });
}

/**
 * One model call for one run. A QUEUED row that is already claimed, or any
 * row that is no longer QUEUED, returns without calling the provider.
 */
export async function executeSequenceDraftRun(runId: string): Promise<void> {
  const run = await prisma.aiSequenceDraftRun.findUnique({
    where: { id: runId },
    select: {
      id: true,
      clientId: true,
      requestedByStaffUserId: true,
      status: true,
    },
  });
  if (!run || run.status !== "QUEUED") return;

  if (!run.requestedByStaffUserId) {
    await prisma.aiSequenceDraftRun.updateMany({
      where: { id: runId, status: "QUEUED" },
      data: {
        status: "FAILED",
        reason: "sequence_draft_crashed",
        message: sequenceDraftFailureMessage("sequence_draft_crashed"),
        finishedAt: new Date(),
        ...terminalPatch,
      },
    });
    return;
  }

  const claimed = await prisma.aiSequenceDraftRun.updateMany({
    where: { id: runId, status: "QUEUED" },
    data: { status: "RUNNING", startedAt: new Date() },
  });
  if (claimed.count !== 1) return;

  try {
    const result = await draftSequenceForClient({
      clientId: run.clientId,
      staffUserId: run.requestedByStaffUserId,
    });
    if (result.ok) {
      await finishRun({
        runId,
        status: "SUCCEEDED",
        reason: null,
        message: sequenceDraftSuccessMessage(result),
        templateIds: result.templateIds,
      });
      revalidatePath(`/clients/${run.clientId}/templates`);
      revalidatePath(`/clients/${run.clientId}/outreach`);
      logger.info(
        {
          scope: "ai.sequence-draft-run",
          clientId: run.clientId,
          runId,
          drafted: result.templateIds.length,
        },
        "Sequence draft run finished",
      );
      return;
    }

    await finishRun({
      runId,
      status: "FAILED",
      reason: result.reason,
      message: sequenceDraftFailureMessage(result.reason),
      templateIds: [],
    });
    logger.warn(
      {
        scope: "ai.sequence-draft-run",
        clientId: run.clientId,
        runId,
        reason: result.reason,
      },
      "Sequence draft run failed",
    );
  } catch (err) {
    logger.error(
      { err, scope: "ai.sequence-draft-run", clientId: run.clientId, runId },
      "Sequence draft run crashed",
    );
    try {
      await finishRun({
        runId,
        status: "FAILED",
        reason: "sequence_draft_crashed",
        message: sequenceDraftFailureMessage("sequence_draft_crashed"),
        templateIds: [],
      });
    } catch (markErr) {
      logger.error(
        { err: markErr, scope: "ai.sequence-draft-run", runId },
        "Sequence draft run could not be marked failed",
      );
    }
  }
}
