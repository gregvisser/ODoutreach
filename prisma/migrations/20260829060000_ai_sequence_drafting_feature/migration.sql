-- Adds the ledger feature code for AI sequence drafting.
--
-- ADDITIVE. This adds one value to an existing enum. No table, column or type
-- is dropped or rewritten, no existing row is read or backfilled, and no
-- existing row can carry the new value. Removing it again restores today's
-- behaviour exactly.
--
-- `ALTER TYPE ... ADD VALUE` is safe inside a transaction on PostgreSQL 12+
-- provided the new value is not USED in the same transaction. Nothing here
-- uses it: the first row carrying SEQUENCE_DRAFTING is written by application
-- code, long after this migration has committed.

-- AlterEnum
ALTER TYPE "AiFeature" ADD VALUE 'SEQUENCE_DRAFTING';
