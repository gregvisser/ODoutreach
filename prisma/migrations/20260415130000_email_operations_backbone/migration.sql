-- CreateEnum
CREATE TYPE "InboundMatchMethod" AS ENUM ('UNLINKED', 'BY_OUTBOUND_PROVIDER_ID', 'BY_THREAD_REF', 'BY_CONTACT_EMAIL');

-- AlterEnum: extend OutboundEmailStatus (existing: QUEUED, SENT, BOUNCED, FAILED)
ALTER TYPE "OutboundEmailStatus" ADD VALUE 'PREPARING';
ALTER TYPE "OutboundEmailStatus" ADD VALUE 'BLOCKED_SUPPRESSION';
ALTER TYPE "OutboundEmailStatus" ADD VALUE 'DELIVERED';

-- AlterTable Client — inbound routing token + optional default sender
ALTER TABLE "Client" ADD COLUMN "inboundIngestToken" TEXT;
UPDATE "Client" SET "inboundIngestToken" = gen_random_uuid()::text WHERE "inboundIngestToken" IS NULL;
ALTER TABLE "Client" ALTER COLUMN "inboundIngestToken" SET NOT NULL;
CREATE UNIQUE INDEX "Client_inboundIngestToken_key" ON "Client"("inboundIngestToken");

ALTER TABLE "Client" ADD COLUMN "defaultSenderEmail" TEXT;

-- AlterTable OutboundEmail — rename legacy column, add lifecycle + correlation
ALTER TABLE "OutboundEmail" RENAME COLUMN "providerId" TO "providerMessageId";

ALTER TABLE "OutboundEmail" ADD COLUMN "correlationId" TEXT;
UPDATE "OutboundEmail" SET "correlationId" = "id" WHERE "correlationId" IS NULL;
ALTER TABLE "OutboundEmail" ALTER COLUMN "correlationId" SET NOT NULL;
CREATE UNIQUE INDEX "OutboundEmail_correlationId_key" ON "OutboundEmail"("correlationId");

ALTER TABLE "OutboundEmail" ADD COLUMN "staffUserId" TEXT;
ALTER TABLE "OutboundEmail" ADD COLUMN "providerName" TEXT;
ALTER TABLE "OutboundEmail" ADD COLUMN "fromAddress" TEXT;
ALTER TABLE "OutboundEmail" ADD COLUMN "toDomain" TEXT;
ALTER TABLE "OutboundEmail" ADD COLUMN "bodySnapshot" TEXT;
ALTER TABLE "OutboundEmail" ADD COLUMN "failureReason" TEXT;
ALTER TABLE "OutboundEmail" ADD COLUMN "suppressionSnapshot" JSONB;
ALTER TABLE "OutboundEmail" ADD COLUMN "queuedAt" TIMESTAMP(3);
ALTER TABLE "OutboundEmail" ADD COLUMN "attemptedAt" TIMESTAMP(3);
ALTER TABLE "OutboundEmail" ADD COLUMN "deliveredAt" TIMESTAMP(3);
ALTER TABLE "OutboundEmail" ADD COLUMN "openedAt" TIMESTAMP(3);
ALTER TABLE "OutboundEmail" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill toDomain from toEmail (simple split)
UPDATE "OutboundEmail" SET "toDomain" = lower(split_part("toEmail", '@', 2)) WHERE "toDomain" IS NULL AND position('@' in "toEmail") > 0;

ALTER TABLE "OutboundEmail" ADD CONSTRAINT "OutboundEmail_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "OutboundEmail_clientId_createdAt_idx" ON "OutboundEmail"("clientId", "createdAt");
CREATE INDEX "OutboundEmail_clientId_status_idx" ON "OutboundEmail"("clientId", "status");
CREATE INDEX "OutboundEmail_providerMessageId_idx" ON "OutboundEmail"("providerMessageId");

-- AlterTable InboundReply
ALTER TABLE "InboundReply" ADD COLUMN "linkedOutboundEmailId" TEXT;
ALTER TABLE "InboundReply" ADD COLUMN "providerMessageId" TEXT;
ALTER TABLE "InboundReply" ADD COLUMN "inReplyToProviderId" TEXT;
ALTER TABLE "InboundReply" ADD COLUMN "toEmail" TEXT;
ALTER TABLE "InboundReply" ADD COLUMN "ingestionSource" TEXT NOT NULL DEFAULT 'webhook';
ALTER TABLE "InboundReply" ADD COLUMN "matchMethod" "InboundMatchMethod" NOT NULL DEFAULT 'UNLINKED';

ALTER TABLE "InboundReply" ADD CONSTRAINT "InboundReply_linkedOutboundEmailId_fkey" FOREIGN KEY ("linkedOutboundEmailId") REFERENCES "OutboundEmail"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "InboundReply_providerMessageId_idx" ON "InboundReply"("providerMessageId");
CREATE INDEX "InboundReply_linkedOutboundEmailId_idx" ON "InboundReply"("linkedOutboundEmailId");
