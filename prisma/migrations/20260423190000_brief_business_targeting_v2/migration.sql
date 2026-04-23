-- Brief v2: business/targeting ownership, reusable taxonomy, compliance PDFs

-- CreateEnum
CREATE TYPE "BriefTaxonomyKind" AS ENUM ('SERVICE_AREA', 'TARGET_INDUSTRY', 'COMPANY_SIZE', 'JOB_TITLE');

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "briefBusinessAddress" JSONB,
ADD COLUMN     "briefMainContact" JSONB,
ADD COLUMN     "briefLinkedinUrl" TEXT,
ADD COLUMN     "briefInternalNotes" TEXT,
ADD COLUMN     "briefAssignedAccountManagerId" TEXT;

-- CreateTable
CREATE TABLE "BriefTaxonomyTerm" (
    "id" TEXT NOT NULL,
    "kind" "BriefTaxonomyKind" NOT NULL,
    "normalizedValue" TEXT NOT NULL,
    "displayValue" TEXT NOT NULL,
    "firstUsedByClientId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BriefTaxonomyTerm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientBriefTermLink" (
    "clientId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,

    CONSTRAINT "ClientBriefTermLink_pkey" PRIMARY KEY ("clientId","termId")
);

-- CreateTable
CREATE TABLE "ClientComplianceAttachment" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedByStaffUserId" TEXT,

    CONSTRAINT "ClientComplianceAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BriefTaxonomyTerm_kind_normalizedValue_key" ON "BriefTaxonomyTerm"("kind", "normalizedValue");

-- CreateIndex
CREATE INDEX "BriefTaxonomyTerm_kind_idx" ON "BriefTaxonomyTerm"("kind");

-- CreateIndex
CREATE INDEX "BriefTaxonomyTerm_firstUsedByClientId_idx" ON "BriefTaxonomyTerm"("firstUsedByClientId");

-- CreateIndex
CREATE INDEX "ClientBriefTermLink_clientId_idx" ON "ClientBriefTermLink"("clientId");

-- CreateIndex
CREATE INDEX "ClientBriefTermLink_termId_idx" ON "ClientBriefTermLink"("termId");

-- CreateIndex
CREATE INDEX "ClientComplianceAttachment_clientId_idx" ON "ClientComplianceAttachment"("clientId");

-- CreateIndex
CREATE INDEX "ClientComplianceAttachment_uploadedByStaffUserId_idx" ON "ClientComplianceAttachment"("uploadedByStaffUserId");

-- CreateIndex
CREATE INDEX "Client_briefAssignedAccountManagerId_idx" ON "Client"("briefAssignedAccountManagerId");

-- AddForeignKey
ALTER TABLE "BriefTaxonomyTerm" ADD CONSTRAINT "BriefTaxonomyTerm_firstUsedByClientId_fkey" FOREIGN KEY ("firstUsedByClientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientBriefTermLink" ADD CONSTRAINT "ClientBriefTermLink_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientBriefTermLink" ADD CONSTRAINT "ClientBriefTermLink_termId_fkey" FOREIGN KEY ("termId") REFERENCES "BriefTaxonomyTerm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientComplianceAttachment" ADD CONSTRAINT "ClientComplianceAttachment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientComplianceAttachment" ADD CONSTRAINT "ClientComplianceAttachment_uploadedByStaffUserId_fkey" FOREIGN KEY ("uploadedByStaffUserId") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_briefAssignedAccountManagerId_fkey" FOREIGN KEY ("briefAssignedAccountManagerId") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
