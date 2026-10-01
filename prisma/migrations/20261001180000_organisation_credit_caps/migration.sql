-- Per-organisation RocketReach allowance and AI spend cap.
-- Null means no extra cap, which is OpensDoors today. Idempotent.

ALTER TABLE "Organisation" ADD COLUMN IF NOT EXISTS "rocketReachCreditAllowance" INTEGER;
ALTER TABLE "Organisation" ADD COLUMN IF NOT EXISTS "rocketReachCreditsUsed" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Organisation" ADD COLUMN IF NOT EXISTS "aiSpendCapMicroUsd" INTEGER;
