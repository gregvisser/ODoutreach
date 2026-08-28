-- Advisory reply claiming — "Sarah opened this 2 minutes ago".
--
-- ADDITIVE ONLY. One new table and one new enum. No existing table is
-- altered, no column is dropped or made non-nullable, and no existing row is
-- read or rewritten. Applying this to a live database changes nothing that is
-- already there, and dropping the table would restore the previous behaviour
-- exactly.
--
-- ReplyClaim is ADVISORY, NOT A LOCK. No send gate, suppression check or
-- governance decision reads it. It only decides what the second operator is
-- TOLD before they act, so an empty or stale table degrades to today's
-- behaviour (say nothing) rather than to a wrong one.
--
-- Why its own table and not `InboundMailboxMessage.metadata`, where the
-- neighbouring handled/reply state lives: the reply sync's upsert writes
-- `metadata` wholesale on every run (`mailbox-inbox-sync.ts`), so anything
-- stored there is erased for recent messages every 15 minutes. A claim in
-- that column would look wired up and quietly stop being shown.

-- CreateEnum
CREATE TYPE "ReplyClaimSubjectType" AS ENUM ('INBOUND_MESSAGE', 'INBOUND_REPLY');

-- CreateTable
CREATE TABLE "ReplyClaim" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "subjectType" "ReplyClaimSubjectType" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "staffUserId" TEXT NOT NULL,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReplyClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReplyClaim_clientId_subjectType_subjectId_claimedAt_idx" ON "ReplyClaim"("clientId", "subjectType", "subjectId", "claimedAt");

-- CreateIndex
CREATE INDEX "ReplyClaim_staffUserId_idx" ON "ReplyClaim"("staffUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ReplyClaim_clientId_subjectType_subjectId_staffUserId_key" ON "ReplyClaim"("clientId", "subjectType", "subjectId", "staffUserId");

-- AddForeignKey
ALTER TABLE "ReplyClaim" ADD CONSTRAINT "ReplyClaim_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplyClaim" ADD CONSTRAINT "ReplyClaim_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "StaffUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
