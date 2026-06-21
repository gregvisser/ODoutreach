import "server-only";

import { prisma } from "@/lib/db";

import { executeOutboundSend } from "./execute-one";

const CLAIM_MS = 10 * 60 * 1000;

export type ProcessQueueResult = {
  claimed: number;
  completed: number;
  errors: string[];
};

/**
 * Claims QUEUED rows with SKIP LOCKED, moves to PROCESSING, increments sendAttempt,
 * assigns deterministic providerIdempotencyKey for ESP idempotency headers.
 */
export async function processOutboundSendQueue(opts: {
  limit: number;
}): Promise<ProcessQueueResult> {
  const limit = Math.min(Math.max(opts.limit, 1), 50);
  const now = new Date();
  const claimExpires = new Date(now.getTime() + CLAIM_MS);

  const claimed = await prisma.$queryRaw<
    {
      id: string;
    }[]
  >`
    WITH picked AS (
      SELECT "OutboundEmail"."id"
      FROM "OutboundEmail"
      WHERE "OutboundEmail"."status" = 'QUEUED'::"OutboundEmailStatus"
        AND ("OutboundEmail"."nextRetryAt" IS NULL OR "OutboundEmail"."nextRetryAt" <= ${now})
        AND (
          "OutboundEmail"."claimedAt" IS NULL
          OR "OutboundEmail"."claimExpiresAt" IS NULL
          OR "OutboundEmail"."claimExpiresAt" < ${now}
        )
        -- F2 + M1: never claim a send whose workspace cannot currently send —
        -- soft-deleted (deletedAt set) OR paused/archived (Client.status).
        -- Read-side only: the QUEUED rows are left untouched, so restoring or
        -- reactivating the workspace resumes its backlog cleanly. This is a
        -- no-op for every live workspace (deletedAt null and status
        -- ONBOARDING/ACTIVE), so it changes nothing for a currently-sending
        -- client; it only makes "pause/archive the client" actually halt the
        -- in-flight queue, which it previously did not (the F2 deletedAt guard
        -- alone left a paused workspace's backlog draining).
        AND EXISTS (
          SELECT 1 FROM "Client" c
          WHERE c."id" = "OutboundEmail"."clientId"
            AND c."deletedAt" IS NULL
            AND c."status" NOT IN (
              'PAUSED'::"ClientLifecycleStatus",
              'ARCHIVED'::"ClientLifecycleStatus"
            )
        )
      ORDER BY "OutboundEmail"."queuedAt" ASC NULLS LAST, "OutboundEmail"."createdAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE "OutboundEmail" AS o
    SET
      "status" = 'PROCESSING'::"OutboundEmailStatus",
      "sendAttempt" = o."sendAttempt" + 1,
      "providerIdempotencyKey" = 'osm_' || o."id" || '_a' || (o."sendAttempt" + 1)::text,
      "claimedAt" = ${now},
      "claimExpiresAt" = ${claimExpires},
      "lastAttemptAt" = ${now},
      "attemptedAt" = ${now}
    FROM picked
    WHERE o."id" = picked."id"
    RETURNING o."id";
  `;

  const errors: string[] = [];
  let completed = 0;

  for (const row of claimed) {
    const r = await executeOutboundSend(row.id);
    if (r.ok) {
      completed += 1;
    } else if (r.error) {
      errors.push(`${row.id}: ${r.error}`);
    }
  }

  return { claimed: claimed.length, completed, errors };
}
