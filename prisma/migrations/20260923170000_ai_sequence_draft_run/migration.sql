-- "Write a sequence with AI" no longer holds the browser request open.
--
-- ADDITIVE ONLY. One new enum and one new table. Nothing existing is dropped,
-- altered, rewritten or backfilled. The model call is recorded here and the
-- staff POST returns immediately; draft templates, when a run succeeds, are
-- still ordinary ClientEmailTemplate rows. Dropping this table removes the
-- progress record only.

CREATE TYPE "AiSequenceDraftRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

CREATE TABLE "AiSequenceDraftRun" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "requestedByStaffUserId" TEXT,
    "status" "AiSequenceDraftRunStatus" NOT NULL,
    "activeClientId" TEXT,
    "reason" TEXT,
    "message" TEXT,
    "templateIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiSequenceDraftRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiSequenceDraftRun_activeClientId_key" ON "AiSequenceDraftRun"("activeClientId");
CREATE INDEX "AiSequenceDraftRun_clientId_createdAt_idx" ON "AiSequenceDraftRun"("clientId", "createdAt");
CREATE INDEX "AiSequenceDraftRun_status_createdAt_idx" ON "AiSequenceDraftRun"("status", "createdAt");
CREATE INDEX "AiSequenceDraftRun_requestedByStaffUserId_idx" ON "AiSequenceDraftRun"("requestedByStaffUserId");

ALTER TABLE "AiSequenceDraftRun" ADD CONSTRAINT "AiSequenceDraftRun_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiSequenceDraftRun" ADD CONSTRAINT "AiSequenceDraftRun_requestedByStaffUserId_fkey" FOREIGN KEY ("requestedByStaffUserId") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
