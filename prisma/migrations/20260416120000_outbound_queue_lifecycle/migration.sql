-- Outbound queue lifecycle, provider events, retry/claim fields

-- New enum values (PostgreSQL: one statement per value is safest across versions)
ALTER TYPE "OutboundEmailStatus" ADD VALUE 'REQUESTED';
ALTER TYPE "OutboundEmailStatus" ADD VALUE 'PROCESSING';
ALTER TYPE "OutboundEmailStatus" ADD VALUE 'REPLIED';

-- Provider event audit
CREATE TABLE "OutboundProviderEvent" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "outboundEmailId" TEXT,
    "providerName" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboundProviderEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OutboundProviderEvent_providerMessageId_idx" ON "OutboundProviderEvent"("providerMessageId");
CREATE INDEX "OutboundProviderEvent_outboundEmailId_idx" ON "OutboundProviderEvent"("outboundEmailId");
CREATE INDEX "OutboundProviderEvent_clientId_createdAt_idx" ON "OutboundProviderEvent"("clientId", "createdAt");

ALTER TABLE "OutboundProviderEvent" ADD CONSTRAINT "OutboundProviderEvent_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OutboundProviderEvent" ADD CONSTRAINT "OutboundProviderEvent_outboundEmailId_fkey" FOREIGN KEY ("outboundEmailId") REFERENCES "OutboundEmail"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- OutboundEmail new columns
ALTER TABLE "OutboundEmail" ADD COLUMN "lastErrorCode" TEXT;
ALTER TABLE "OutboundEmail" ADD COLUMN "lastErrorMessage" TEXT;
ALTER TABLE "OutboundEmail" ADD COLUMN "lastProviderEventType" TEXT;
ALTER TABLE "OutboundEmail" ADD COLUMN "providerStatus" TEXT;
ALTER TABLE "OutboundEmail" ADD COLUMN "bounceCategory" TEXT;
ALTER TABLE "OutboundEmail" ADD COLUMN "retryCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "OutboundEmail" ADD COLUMN "lastAttemptAt" TIMESTAMP(3);
ALTER TABLE "OutboundEmail" ADD COLUMN "nextRetryAt" TIMESTAMP(3);
ALTER TABLE "OutboundEmail" ADD COLUMN "claimedAt" TIMESTAMP(3);
ALTER TABLE "OutboundEmail" ADD COLUMN "claimExpiresAt" TIMESTAMP(3);
ALTER TABLE "OutboundEmail" ADD COLUMN "bouncedAt" TIMESTAMP(3);

-- Default new rows to QUEUED (worker-eligible)
ALTER TABLE "OutboundEmail" ALTER COLUMN "status" SET DEFAULT 'QUEUED'::"OutboundEmailStatus";

CREATE INDEX "OutboundEmail_status_nextRetryAt_queuedAt_idx" ON "OutboundEmail"("status", "nextRetryAt", "queuedAt");
