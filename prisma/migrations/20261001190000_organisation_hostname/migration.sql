-- Optional public hostname per organisation. Null matches today's
-- single-host OpensDoors app. Idempotent. The code also reserves
-- opensdoors.bidlow.co.uk, so this backfill is not the only lock.

ALTER TABLE "Organisation" ADD COLUMN IF NOT EXISTS "hostname" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Organisation_hostname_key" ON "Organisation" ("hostname");

UPDATE "Organisation"
SET "hostname" = 'opensdoors.bidlow.co.uk'
WHERE "id" = 'org_opensdoors'
  AND "hostname" IS NULL;
