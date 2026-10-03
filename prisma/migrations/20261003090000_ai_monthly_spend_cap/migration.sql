-- Greg, 2026-10-03: xAI spend is capped at $50 USD per calendar month (UTC)
-- per organisation. The cap column becomes a MONTHLY cap with a $50 default
-- (50,000,000 micro-USD). Organisations with no cap set get the default.
-- A platform admin can still raise, lower, or clear it per organisation.
-- Idempotent.

ALTER TABLE "Organisation" ALTER COLUMN "aiSpendCapMicroUsd" SET DEFAULT 50000000;
UPDATE "Organisation" SET "aiSpendCapMicroUsd" = 50000000 WHERE "aiSpendCapMicroUsd" IS NULL;
