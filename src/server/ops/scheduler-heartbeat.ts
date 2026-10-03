import "server-only";

import { prisma } from "@/lib/db";
import { runAsSystem } from "@/lib/tenant/organisation-context";
import { SENDING_HEARTBEAT_NAME } from "@/lib/alerts/sending-heartbeat";

/**
 * Heartbeat writes never break a scheduler run. A write failure is logged and
 * the run carries on; a missing heartbeat then shows up as stale in the alert.
 */
async function safely(label: string, write: () => Promise<unknown>): Promise<void> {
  try {
    await runAsSystem(write);
  } catch (error) {
    console.error(JSON.stringify({
      event: "scheduler_heartbeat_write_failed",
      label,
      error: error instanceof Error ? error.message.slice(0, 300) : "unknown",
    }));
  }
}

/** The plan phase runs first on every WebJob run, day and night. */
export async function recordSchedulerRun(now: Date = new Date()): Promise<void> {
  await safely("run", () =>
    prisma.schedulerHeartbeat.upsert({
      where: { name: SENDING_HEARTBEAT_NAME },
      create: { name: SENDING_HEARTBEAT_NAME, lastRunAt: now },
      update: { lastRunAt: now },
    }),
  );
}

/** The queue phase drains the send queue. `error` is null on a clean drain. */
export async function recordSendQueueRun(input: {
  ok: boolean;
  error: string | null;
  claimed: number;
  completed: number;
  now?: Date;
}): Promise<void> {
  const now = input.now ?? new Date();
  const error = input.ok ? null : (input.error ?? "Sending failed").slice(0, 500);
  await safely("queue", () =>
    prisma.schedulerHeartbeat.upsert({
      where: { name: SENDING_HEARTBEAT_NAME },
      create: {
        name: SENDING_HEARTBEAT_NAME,
        lastRunAt: now,
        lastQueueAt: now,
        lastQueueOkAt: input.ok ? now : null,
        lastQueueError: error,
        consecutiveQueueFailures: input.ok ? 0 : 1,
        lastQueueClaimed: input.claimed,
        lastQueueCompleted: input.completed,
      },
      update: {
        lastQueueAt: now,
        ...(input.ok ? { lastQueueOkAt: now } : {}),
        lastQueueError: error,
        consecutiveQueueFailures: input.ok ? 0 : { increment: 1 },
        lastQueueClaimed: input.claimed,
        lastQueueCompleted: input.completed,
      },
    }),
  );
}
