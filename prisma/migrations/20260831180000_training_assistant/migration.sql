-- App-shell "how do I..." search bar over the training content (queue row 149).
--
-- ADDITIVE ONLY. One new enum value on the existing `AiFeature` enum, one new
-- enum, and one new table. Nothing existing is dropped, altered, rewritten or
-- backfilled, and dropping what this adds restores today's behaviour exactly:
-- no code path outside the new assistant feature reads any of it.
--
-- `ALTER TYPE ... ADD VALUE` is transaction-safe on PostgreSQL 12+ provided the
-- new value is not USED in the same transaction. It is not: the first row
-- carrying TRAINING_ASSISTANT is written by application code long after this
-- migration commits.

ALTER TYPE "AiFeature" ADD VALUE 'TRAINING_ASSISTANT';

CREATE TYPE "TrainingAssistantUnansweredReason" AS ENUM ('NO_MATCHING_CONTENT', 'MODEL_UNSURE', 'AI_CALL_REFUSED', 'AI_CALL_ERROR');

CREATE TABLE "TrainingAssistantUnansweredQuestion" (
    "id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "reason" "TrainingAssistantUnansweredReason" NOT NULL,
    "askedByEmail" TEXT NOT NULL,
    "raisedSupportTicketId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingAssistantUnansweredQuestion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TrainingAssistantUnansweredQuestion_createdAt_idx" ON "TrainingAssistantUnansweredQuestion"("createdAt");
CREATE INDEX "TrainingAssistantUnansweredQuestion_raisedSupportTicketId_idx" ON "TrainingAssistantUnansweredQuestion"("raisedSupportTicketId");
