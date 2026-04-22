-- PR P — Store full inbound email bodies (additive only).
--
-- Adds nullable full-body cache columns to `InboundMailboxMessage` so
-- operators can read the complete reply inside ODoutreach instead of
-- having to open Outlook / Gmail. Raw HTML is never persisted — we only
-- store the sanitized / text-extracted rendering in `bodyText`.
--
-- Safety:
--   * Additive only — all new columns are nullable (or have a trivial
--     default) so existing rows remain valid.
--   * No existing column is altered or dropped.
--   * No data is rewritten.
--   * No sends, imports, or suppression syncs are triggered by this
--     migration.

-- AlterTable
ALTER TABLE "InboundMailboxMessage"
    ADD COLUMN "bodyText" TEXT,
    ADD COLUMN "bodyContentType" TEXT,
    ADD COLUMN "fullBodySize" INTEGER,
    ADD COLUMN "fullBodySource" TEXT,
    ADD COLUMN "fullBodyFetchedAt" TIMESTAMP(3),
    ADD COLUMN "fullBodyStorageVersion" INTEGER NOT NULL DEFAULT 1;
