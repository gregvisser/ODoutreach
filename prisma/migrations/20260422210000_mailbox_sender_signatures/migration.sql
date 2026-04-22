-- PR — Mailbox sender signatures (additive only, 2026-04-22).
--
-- Adds nullable per-mailbox sender identity columns to `ClientMailboxIdentity`
-- so each connected outreach mailbox can carry its own sender display name
-- and email signature. Gmail mailboxes can sync these automatically from
-- `users.settings.sendAs`; Microsoft mailboxes rely on manual entry because
-- Microsoft Graph does not expose a stable mailbox-signature API.
--
-- Safety:
--   * Additive only — every new column is nullable so existing rows stay valid.
--   * No existing column is altered or dropped; `displayName` is preserved
--     for connection-profile display and kept in sync at UI level.
--   * No data is rewritten.
--   * No sends, imports or suppression syncs are triggered by this migration.

-- AlterTable
ALTER TABLE "ClientMailboxIdentity"
    ADD COLUMN "senderDisplayName" TEXT,
    ADD COLUMN "senderSignatureHtml" TEXT,
    ADD COLUMN "senderSignatureText" TEXT,
    ADD COLUMN "senderSignatureSource" TEXT,
    ADD COLUMN "senderSignatureSyncedAt" TIMESTAMP(3),
    ADD COLUMN "senderSignatureSyncError" TEXT;
