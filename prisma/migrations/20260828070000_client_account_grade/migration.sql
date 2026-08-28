-- Client account grade (CORPORATE / MID / STANDARD) with on-screen attribution.
--
-- PURELY ADDITIVE. One new enum type, three new NULLABLE columns, one foreign
-- key onto the existing StaffUser, one index. No existing column is altered, no
-- default is applied to existing rows, and nothing is backfilled. Dropping
-- everything below restores today's behaviour exactly: an ungraded client is
-- handled as STANDARD, which is what every client does today.

-- CreateEnum
CREATE TYPE "ClientAccountGrade" AS ENUM ('CORPORATE', 'MID', 'STANDARD');

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "accountGrade" "ClientAccountGrade",
ADD COLUMN     "accountGradeSetByStaffUserId" TEXT,
ADD COLUMN     "accountGradeSetAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Client_accountGradeSetByStaffUserId_idx" ON "Client"("accountGradeSetByStaffUserId");

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_accountGradeSetByStaffUserId_fkey" FOREIGN KEY ("accountGradeSetByStaffUserId") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
