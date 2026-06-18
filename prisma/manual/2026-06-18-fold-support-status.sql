-- ============================================================================
-- Manual DATA migration (NOT a schema change) — fold legacy support-ticket
-- statuses into OPEN for the simplified Open/Resolved support flow.
--
-- Context: the support flow was simplified to two statuses the app uses (OPEN,
-- RESOLVED). The Prisma enum still carries the legacy values (IN_REVIEW,
-- AWAITING_APPROVAL, APPROVED, REJECTED) so this is reversible and needs NO
-- schema migration. This script only rewrites in-flight rows so they show up
-- as actionable OPEN tickets again.
--
-- Safety:
--   * Wrapped in a transaction.
--   * Snapshots every affected (id, old status) pair into a backup table first,
--     so 2026-06-18-fold-support-status.rollback.sql can restore them exactly.
--   * Idempotent: re-running affects 0 rows and keeps the original snapshot.
--   * The app does NOT need this to function — resolveSupportTicket accepts any
--     non-resolved status — so it can be run any time after the code deploy.
--
-- How to run (production, deliberate + confirm-first):
--   psql "$PRODUCTION_DATABASE_URL" -f prisma/manual/2026-06-18-fold-support-status.sql
-- ============================================================================

BEGIN;

-- 1. Snapshot the rows we are about to change (for an exact rollback).
CREATE TABLE IF NOT EXISTS "_support_status_backup_20260618" AS
SELECT id, status::text AS old_status
FROM "SupportTicket"
WHERE status NOT IN ('OPEN', 'RESOLVED');

-- 2. Fold every legacy in-flight status into OPEN.
UPDATE "SupportTicket"
SET status = 'OPEN'
WHERE status NOT IN ('OPEN', 'RESOLVED');

-- 3. Show what was changed (row count + remaining distribution).
SELECT 'rows_backed_up' AS metric, count(*)::text AS value
FROM "_support_status_backup_20260618"
UNION ALL
SELECT 'status=' || status::text, count(*)::text
FROM "SupportTicket"
GROUP BY status;

COMMIT;
