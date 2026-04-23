-- PR — Client logo fields (additive only, 2026-04-23).
--
-- Adds optional per-client branding columns to `Client` so each client
-- workspace can carry its own logo. The UI renders these in the client
-- workspace header, overview, and brief. Global OpensDoors branding is
-- served from `/public/branding` and unaffected by this migration.
--
-- Safety:
--   * Additive only — both columns are nullable, every existing row
--     remains valid without backfill.
--   * No existing column is altered or dropped.
--   * No data is rewritten.
--   * No sends, imports, suppression syncs, OAuth changes, or tenant
--     cutovers are triggered by this migration.

-- AlterTable
ALTER TABLE "Client"
    ADD COLUMN "logoUrl" TEXT,
    ADD COLUMN "logoAltText" TEXT;
