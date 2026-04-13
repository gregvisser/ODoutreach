-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "fullName" TEXT,
ADD COLUMN     "emailDomain" TEXT;

-- AlterTable
ALTER TABLE "ContactImportBatch" ADD COLUMN     "summary" JSONB,
ADD COLUMN     "completedAt" TIMESTAMP(3);
