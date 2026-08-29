
-- CreateEnum
CREATE TYPE "ReplyClassification" AS ENUM ('POSITIVE', 'INTERESTED_LATER', 'REFERRAL', 'NOT_INTERESTED', 'UNSUBSCRIBE', 'UNCLEAR');

-- CreateEnum
CREATE TYPE "AiFeature" AS ENUM ('REPLY_CLASSIFICATION');

-- CreateEnum
CREATE TYPE "AiCallStatus" AS ENUM ('OK', 'REFUSED', 'ERROR');

-- AlterTable
ALTER TABLE "InboundReply" ADD COLUMN     "classification" "ReplyClassification",
ADD COLUMN     "classificationConfidence" INTEGER,
ADD COLUMN     "classificationModel" TEXT,
ADD COLUMN     "classificationRationale" TEXT,
ADD COLUMN     "classifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AiUsageEvent" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "clientSlugAtCall" TEXT NOT NULL,
    "feature" "AiFeature" NOT NULL,
    "status" "AiCallStatus" NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "costMicroUsd" INTEGER NOT NULL DEFAULT 0,
    "inputRatePerMTokMicroUsd" INTEGER NOT NULL DEFAULT 0,
    "outputRatePerMTokMicroUsd" INTEGER NOT NULL DEFAULT 0,
    "rateVersion" TEXT NOT NULL,
    "latencyMs" INTEGER,
    "subjectType" TEXT,
    "subjectId" TEXT,
    "outcomeCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiUsageEvent_clientId_createdAt_idx" ON "AiUsageEvent"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "AiUsageEvent_feature_createdAt_idx" ON "AiUsageEvent"("feature", "createdAt");

-- CreateIndex
CREATE INDEX "AiUsageEvent_createdAt_idx" ON "AiUsageEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "AiUsageEvent" ADD CONSTRAINT "AiUsageEvent_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

