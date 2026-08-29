-- Which campaign suits which job title (queue row 80, item 7).
--
-- ADDITIVE ONLY. One new enum value and one new table. Nothing existing is
-- dropped, altered, rewritten or backfilled, and dropping what this adds
-- restores today's behaviour exactly: no code path outside the new panel reads
-- either object. In particular the send pipeline, the sequence launch rail,
-- enrollments and contact targeting do not, and cannot — this feature has no
-- write path to any of them.
--
-- There is deliberately no column here holding suggested copy, a subject line
-- or a recommended change to a campaign. See `src/lib/ai/title-message.ts`:
-- draft text arriving alongside a statistic is one copy-paste from a real send,
-- and that is the specific failure this feature is shaped to prevent.
--
-- `zThresholdMilli` is an integer of milli-standard-errors rather than a float,
-- for the same reason money is integer micro-USD in this schema: the value is
-- compared and ordered, and a float that drifts in the last place would make
-- two identical analyses disagree about whether a gap cleared the bar.
--
-- `ALTER TYPE ... ADD VALUE` is transaction-safe on PostgreSQL 12+ provided the
-- new value is not USED in the same transaction. It is not: the first row
-- carrying TITLE_MESSAGE_FIT is written by application code long after this
-- migration commits.

ALTER TYPE "AiFeature" ADD VALUE 'TITLE_MESSAGE_FIT';

CREATE TABLE "AiTitleMessageReview" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "findings" JSONB NOT NULL,
    "cautions" JSONB NOT NULL,
    "evidence" JSONB NOT NULL,
    "coverage" JSONB NOT NULL,
    "totalReplied" INTEGER NOT NULL,
    "totalPositive" INTEGER NOT NULL,
    "lookbackDays" INTEGER NOT NULL,
    "comparisonCount" INTEGER NOT NULL,
    "zThresholdMilli" INTEGER NOT NULL,
    "anyDistinguishable" BOOLEAN NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "requestedByStaffUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiTitleMessageReview_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiTitleMessageReview_clientId_createdAt_idx" ON "AiTitleMessageReview"("clientId", "createdAt");
CREATE INDEX "AiTitleMessageReview_requestedByStaffUserId_idx" ON "AiTitleMessageReview"("requestedByStaffUserId");

ALTER TABLE "AiTitleMessageReview" ADD CONSTRAINT "AiTitleMessageReview_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiTitleMessageReview" ADD CONSTRAINT "AiTitleMessageReview_requestedByStaffUserId_fkey" FOREIGN KEY ("requestedByStaffUserId") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
