-- Liveness of the Azure WebJob that sends outreach. The ops alert reads this
-- instead of GitHub run history, which stopped sending on 3 Oct 2026.
CREATE TABLE IF NOT EXISTS "SchedulerHeartbeat" (
    "name" TEXT NOT NULL,
    "lastRunAt" TIMESTAMP(3) NOT NULL,
    "lastQueueAt" TIMESTAMP(3),
    "lastQueueOkAt" TIMESTAMP(3),
    "lastQueueError" TEXT,
    "consecutiveQueueFailures" INTEGER NOT NULL DEFAULT 0,
    "lastQueueClaimed" INTEGER NOT NULL DEFAULT 0,
    "lastQueueCompleted" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SchedulerHeartbeat_pkey" PRIMARY KEY ("name")
);
