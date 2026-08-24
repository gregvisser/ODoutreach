-- Machine-proposed do-not-contact family links, and where a confirmed one came from.
--
-- ADDITIVE ONLY. No DROP, no data change, no column made non-nullable.
-- Every existing SuppressedDomainFamily row keeps sourceProposalId/discoveredSource/
-- discoveredAt NULL, which is exactly the intended meaning: a human typed it.
--
-- Nothing in SuppressedDomainFamilyProposal is read by the send gate. RULING 3
-- (Greg, 2026-08-24) still holds: only a human confirmation writes a family row.

-- CreateEnum
-- CreateEnum
CREATE TYPE "FamilyProposalSource" AS ENUM ('DMARC_RUA', 'SPF_REDIRECT');

-- CreateEnum
CREATE TYPE "FamilyProposalStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED');

-- AlterTable
ALTER TABLE "SuppressedDomainFamily" ADD COLUMN     "discoveredAt" TIMESTAMP(3),
ADD COLUMN     "discoveredSource" "FamilyProposalSource",
ADD COLUMN     "sourceProposalId" TEXT;

-- CreateTable
CREATE TABLE "SuppressedDomainFamilyProposal" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "seedDomain" TEXT NOT NULL,
    "proposedDomain" TEXT NOT NULL,
    "source" "FamilyProposalSource" NOT NULL,
    "evidence" TEXT NOT NULL,
    "fanIn" INTEGER NOT NULL,
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "FamilyProposalStatus" NOT NULL DEFAULT 'PENDING',
    "decidedByStaffUserId" TEXT,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "SuppressedDomainFamilyProposal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SuppressedDomainFamilyProposal_clientId_status_idx" ON "SuppressedDomainFamilyProposal"("clientId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SuppressedDomainFamilyProposal_clientId_seedDomain_proposed_key" ON "SuppressedDomainFamilyProposal"("clientId", "seedDomain", "proposedDomain");

-- CreateIndex
CREATE UNIQUE INDEX "SuppressedDomainFamily_sourceProposalId_key" ON "SuppressedDomainFamily"("sourceProposalId");

-- AddForeignKey
ALTER TABLE "SuppressedDomainFamily" ADD CONSTRAINT "SuppressedDomainFamily_sourceProposalId_fkey" FOREIGN KEY ("sourceProposalId") REFERENCES "SuppressedDomainFamilyProposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuppressedDomainFamilyProposal" ADD CONSTRAINT "SuppressedDomainFamilyProposal_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuppressedDomainFamilyProposal" ADD CONSTRAINT "SuppressedDomainFamilyProposal_decidedByStaffUserId_fkey" FOREIGN KEY ("decidedByStaffUserId") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

