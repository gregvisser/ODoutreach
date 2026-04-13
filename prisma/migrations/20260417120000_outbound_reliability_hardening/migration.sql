-- Sender identity, send idempotency, webhook dedupe, lifecycle timestamps

CREATE TYPE "SenderIdentityStatus" AS ENUM ('NOT_SET', 'CONFIGURED_UNVERIFIED', 'VERIFIED_READY');

ALTER TABLE "Client" ADD COLUMN "senderIdentityStatus" "SenderIdentityStatus" NOT NULL DEFAULT 'NOT_SET';

UPDATE "Client"
SET "senderIdentityStatus" = 'CONFIGURED_UNVERIFIED'
WHERE TRIM(COALESCE("defaultSenderEmail", '')) <> '';

ALTER TABLE "OutboundEmail" ADD COLUMN "sendAttempt" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "OutboundEmail" ADD COLUMN "providerIdempotencyKey" TEXT;
ALTER TABLE "OutboundEmail" ADD COLUMN "lastProviderEventAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "OutboundEmail_providerIdempotencyKey_key" ON "OutboundEmail"("providerIdempotencyKey");

-- Provider events: dedupe + replay metadata (backfill legacy rows)
ALTER TABLE "OutboundProviderEvent" ADD COLUMN "webhookMessageId" TEXT;
ALTER TABLE "OutboundProviderEvent" ADD COLUMN "dedupeHash" TEXT;
ALTER TABLE "OutboundProviderEvent" ADD COLUMN "receivedAt" TIMESTAMP(3);
UPDATE "OutboundProviderEvent" SET "receivedAt" = "createdAt" WHERE "receivedAt" IS NULL;
ALTER TABLE "OutboundProviderEvent" ALTER COLUMN "receivedAt" SET NOT NULL;
ALTER TABLE "OutboundProviderEvent" ALTER COLUMN "receivedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "OutboundProviderEvent" ADD COLUMN "stateMutated" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "OutboundProviderEvent" ADD COLUMN "replayDuplicate" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "OutboundProviderEvent" ADD COLUMN "processingNote" TEXT;

UPDATE "OutboundProviderEvent" SET "dedupeHash" = 'legacy_' || "id" WHERE "dedupeHash" IS NULL;
ALTER TABLE "OutboundProviderEvent" ALTER COLUMN "dedupeHash" SET NOT NULL;

CREATE UNIQUE INDEX "OutboundProviderEvent_dedupeHash_key" ON "OutboundProviderEvent"("dedupeHash");
CREATE INDEX "OutboundProviderEvent_webhookMessageId_idx" ON "OutboundProviderEvent"("webhookMessageId");
