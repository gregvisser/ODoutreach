-- ============================================================================
-- ROLLBACK for 2026-06-18-fold-support-status.sql.
--
-- Restores every support ticket whose status was folded to OPEN back to the
-- exact legacy status it had at migration time, using the snapshot table, then
-- drops the snapshot. Only meaningful if the forward script ran and the backup
-- table still exists.
--
-- How to run (production):
--   psql "$PRODUCTION_DATABASE_URL" -f prisma/manual/2026-06-18-fold-support-status.rollback.sql
-- ============================================================================

BEGIN;

-- Restore the original status for each snapshotted ticket.
UPDATE "SupportTicket" t
SET status = b.old_status::"SupportTicketStatus"
FROM "_support_status_backup_20260618" b
WHERE t.id = b.id;

-- Report what was restored, then remove the snapshot.
SELECT 'rows_restored' AS metric, count(*)::text AS value
FROM "_support_status_backup_20260618";

DROP TABLE IF EXISTS "_support_status_backup_20260618";

COMMIT;
