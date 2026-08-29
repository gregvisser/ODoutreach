-- AI-chosen send times (queue row 80, item 5).
--
-- ADDITIVE ONLY. One new enum value and one new table. Nothing existing is
-- dropped, altered, rewritten or backfilled, and dropping what this adds
-- restores today's behaviour exactly: no code path outside the new send-time
-- panel reads either object, and in particular the send pipeline does not.
--
-- There is deliberately no column here that a scheduler could consume. The
-- recommended windows are stored as JSON for display, because when mail
-- actually leaves is decided by the cron in
-- `.github/workflows/process-outbound-queue.yml` and by nothing in this
-- database. A column named like a setting would eventually be read as one.
--
-- `ALTER TYPE ... ADD VALUE` is transaction-safe on PostgreSQL 12+ provided the
-- new value is not USED in the same transaction. It is not: the first row
-- carrying SEND_TIME_ADVICE is written by application code long after this
-- migration commits.

ALTER TYPE "AiFeature" ADD VALUE 'SEND_TIME_ADVICE';

CREATE TABLE "AiSendTimeAdvice" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "windows" JSONB NOT NULL,
    "cautions" JSONB NOT NULL,
    "evidence" JSONB NOT NULL,
    "totalSent" INTEGER NOT NULL,
    "totalReplied" INTEGER NOT NULL,
    "lookbackDays" INTEGER NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "requestedByStaffUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiSendTimeAdvice_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiSendTimeAdvice_clientId_createdAt_idx" ON "AiSendTimeAdvice"("clientId", "createdAt");
CREATE INDEX "AiSendTimeAdvice_requestedByStaffUserId_idx" ON "AiSendTimeAdvice"("requestedByStaffUserId");

ALTER TABLE "AiSendTimeAdvice" ADD CONSTRAINT "AiSendTimeAdvice_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiSendTimeAdvice" ADD CONSTRAINT "AiSendTimeAdvice_requestedByStaffUserId_fkey" FOREIGN KEY ("requestedByStaffUserId") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
