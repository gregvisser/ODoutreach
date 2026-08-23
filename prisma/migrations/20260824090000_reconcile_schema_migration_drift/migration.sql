-- RECONCILE SCHEMA / MIGRATION-HISTORY DRIFT
--
-- `prisma/schema.prisma` and the migration history have disagreed since the
-- project's FIRST COMMIT. Every `prisma migrate dev` since has tried to smuggle
-- the difference into whatever feature migration was being written — it did
-- exactly that to the Ruling 3 migration on 2026-08-23 and had to be trimmed out
-- by hand. This closes it deliberately instead.
--
-- Reproduce the finding with:
--   SHADOW_DATABASE_URL=<throwaway db> npx prisma migrate diff \
--     --from-migrations prisma/migrations --to-schema prisma/schema.prisma --script
--
-- WHAT THE DRIFT WAS, AND WHERE EACH PIECE CAME FROM (investigated 2026-08-24):
--
--   1. Two indexes declared in schema.prisma but created by NO migration:
--        OutboundEmail(correlationId)
--        OutboundProviderEvent(clientId, receivedAt)
--      Both were in schema.prisma at commit 4160c00 — the bootstrap commit — and
--      the initial migration 20260413103000_init never created them. The schema
--      and the first migration were authored from different states.
--      >>> THIS MIGRATION CREATES THEM.
--
--   2. An index name Postgres truncated differently from what a newer Prisma
--      expects. Postgres truncates identifiers at 63 characters:
--      20260419200000_sending_policy_mailbox_ledger asked for
--      "MailboxSendReservation_mailboxIdentityId_windowKey_idempotencyKey_key"
--      and got "..._idempotencyK"; a newer Prisma computes "..._idempote_key".
--      Purely cosmetic. >>> THIS MIGRATION RENAMES IT, guarded.
--
--   3. Two `updatedAt` columns whose DEFAULT the schema did not declare, added by
--      20260415130000_email_operations_backbone and
--      20260418160000_microsoft_inbox_ingest. A default is how you add a NOT NULL
--      column to a table that already has rows — those migrations were CORRECT
--      and the drift was the schema failing to say so.
--      >>> NOT DROPPED. schema.prisma now declares `@default(now())`.
--
--   4. OutboundProviderEvent(clientId, createdAt), created by
--      20260416120000_outbound_queue_lifecycle and later dropped from the schema
--      with no migration to drop it from the database.
--      >>> NOT DROPPED. schema.prisma now declares it again.
--
-- NOBODY RAN SQL OUTSIDE THE MIGRATION SYSTEM. Two applied migrations were edited
-- after the fact (79decef, a client-scope fix; 59be6d1, a UTF-8 BOM strip) but
-- neither caused any of the above. The cause throughout is migrations and schema
-- being authored separately.
--
-- ***  NOTHING IS DROPPED. NO DATA CAN BE LOST BY THIS MIGRATION.  ***
-- It creates two indexes and renames one. Every statement is guarded, so it is
-- safe against a database in any of the three possible states: drifted
-- production, a fresh replay of the history, or one already reconciled.
--
-- Locking: both tables hold low thousands of rows, so a plain CREATE INDEX takes
-- a brief write lock measured in milliseconds. CONCURRENTLY was deliberately NOT
-- used — it cannot run inside the transaction Prisma wraps a migration in, and
-- these tables are nowhere near large enough to need it.

-- 1. Indexes declared since the bootstrap commit but never created.
CREATE INDEX IF NOT EXISTS "OutboundEmail_correlationId_idx"
  ON "OutboundEmail"("correlationId");

CREATE INDEX IF NOT EXISTS "OutboundProviderEvent_clientId_receivedAt_idx"
  ON "OutboundProviderEvent"("clientId", "receivedAt");

-- 2. Cosmetic rename, applied only where the old truncated name is present and
--    the new one is not.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class
    WHERE relkind = 'i'
      AND relname = 'MailboxSendReservation_mailboxIdentityId_windowKey_idempotencyK'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE relkind = 'i'
      AND relname = 'MailboxSendReservation_mailboxIdentityId_windowKey_idempote_key'
  ) THEN
    ALTER INDEX "MailboxSendReservation_mailboxIdentityId_windowKey_idempotencyK"
      RENAME TO "MailboxSendReservation_mailboxIdentityId_windowKey_idempote_key";
  END IF;
END $$;
