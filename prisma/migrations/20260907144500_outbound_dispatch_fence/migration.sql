-- Additive only. Historical attempts are not guessed or backfilled.
ALTER TABLE "OutboundEmail" ADD COLUMN "dispatchStartedAt" TIMESTAMP(3);
