-- The per-client autonomous-send switch (machine sending / human sending),
-- with on-screen attribution.
--
-- PURELY ADDITIVE. Three new NULLABLE columns, one foreign key onto the
-- existing StaffUser, one index. No existing column is altered, no default is
-- applied to existing rows, and nothing is backfilled.
--
-- NULL is load-bearing, not laziness. It means "nobody has decided yet", which
-- the guard REFUSES — distinct from FALSE, which means "someone decided no".
-- Applying a default here would manufacture a decision nobody made.
--
-- Dropping everything below restores today's behaviour exactly: the autonomous
-- guard falls back to the relay allowlist alone, which is what it did before.

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "autonomousSendEnabled" BOOLEAN,
ADD COLUMN     "autonomousSendSetByStaffUserId" TEXT,
ADD COLUMN     "autonomousSendSetAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Client_autonomousSendSetByStaffUserId_idx" ON "Client"("autonomousSendSetByStaffUserId");

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_autonomousSendSetByStaffUserId_fkey" FOREIGN KEY ("autonomousSendSetByStaffUserId") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
