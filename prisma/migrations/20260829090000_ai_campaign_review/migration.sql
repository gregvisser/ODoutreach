-- Campaign quality score and critique (queue row 80, item 4).
--
-- ADDITIVE ONLY. One new enum value and one new table. Nothing existing is
-- dropped, altered, rewritten or backfilled, and dropping what this adds
-- restores today's behaviour exactly: no code path outside the new review
-- feature reads either.
--
-- `ALTER TYPE ... ADD VALUE` is transaction-safe on PostgreSQL 12+ provided the
-- new value is not USED in the same transaction. It is not: the first row
-- carrying CAMPAIGN_REVIEW is written by application code long after this
-- migration commits.

ALTER TYPE "AiFeature" ADD VALUE 'CAMPAIGN_REVIEW';

CREATE TABLE "AiCampaignReview" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "sequenceId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,
    "findings" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "stepCount" INTEGER NOT NULL DEFAULT 0,
    "requestedByStaffUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiCampaignReview_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiCampaignReview_sequenceId_createdAt_idx" ON "AiCampaignReview"("sequenceId", "createdAt");
CREATE INDEX "AiCampaignReview_clientId_createdAt_idx" ON "AiCampaignReview"("clientId", "createdAt");
CREATE INDEX "AiCampaignReview_requestedByStaffUserId_idx" ON "AiCampaignReview"("requestedByStaffUserId");

ALTER TABLE "AiCampaignReview" ADD CONSTRAINT "AiCampaignReview_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiCampaignReview" ADD CONSTRAINT "AiCampaignReview_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "ClientEmailSequence"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiCampaignReview" ADD CONSTRAINT "AiCampaignReview_requestedByStaffUserId_fkey" FOREIGN KEY ("requestedByStaffUserId") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
