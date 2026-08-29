-- Comparing the mailboxes a client sends from (queue row 80, item 6).
--
-- ADDITIVE ONLY. One new enum value and one new table. Nothing existing is
-- dropped, altered, rewritten or backfilled, and dropping what this adds
-- restores today's behaviour exactly: no code path outside the new sender
-- comparison panel reads either object, and in particular the send pipeline and
-- the mailbox rows themselves do not.
--
-- There is deliberately no column here that scores, ranks or grades anybody.
-- The stored `findings` are prose about a MAILBOX — see
-- `src/lib/ai/rep-performance.ts` for why a rating column would be read as a
-- judgement this application had made about an employee, on data that cannot
-- support one. `anyDistinguishable` is stored precisely so a later reader
-- cannot mistake an unequal-looking table for a real difference.
--
-- `ALTER TYPE ... ADD VALUE` is transaction-safe on PostgreSQL 12+ provided the
-- new value is not USED in the same transaction. It is not: the first row
-- carrying REP_PERFORMANCE is written by application code long after this
-- migration commits.

ALTER TYPE "AiFeature" ADD VALUE 'REP_PERFORMANCE';

CREATE TABLE "AiRepPerformanceReview" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "findings" JSONB NOT NULL,
    "cautions" JSONB NOT NULL,
    "evidence" JSONB NOT NULL,
    "totalSent" INTEGER NOT NULL,
    "totalReplied" INTEGER NOT NULL,
    "totalPositive" INTEGER NOT NULL,
    "lookbackDays" INTEGER NOT NULL,
    "anyDistinguishable" BOOLEAN NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "requestedByStaffUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiRepPerformanceReview_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiRepPerformanceReview_clientId_createdAt_idx" ON "AiRepPerformanceReview"("clientId", "createdAt");
CREATE INDEX "AiRepPerformanceReview_requestedByStaffUserId_idx" ON "AiRepPerformanceReview"("requestedByStaffUserId");

ALTER TABLE "AiRepPerformanceReview" ADD CONSTRAINT "AiRepPerformanceReview_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiRepPerformanceReview" ADD CONSTRAINT "AiRepPerformanceReview_requestedByStaffUserId_fkey" FOREIGN KEY ("requestedByStaffUserId") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
