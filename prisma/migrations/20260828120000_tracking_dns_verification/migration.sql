-- Verified email-authentication DNS state, per client (row 41).
--
-- ADDITIVE + REVERSIBLE. Adds three nullable columns to "Client". No existing
-- column is read, rewritten or backfilled, and no row is touched. Dropping all
-- three restores today's behaviour exactly: every client falls back to
-- trackingDnsVerifiedAt = NULL, which the send-time gate already treats as OFF.
--
-- Why NULL is the right default and no backfill is wanted: NULL means "this
-- system has never resolved this customer's DNS itself". That is the truth for
-- every existing client at the moment this migration runs, and it is the SAFE
-- state — tracking stays off until the verifier has actually looked. A backfill
-- would manufacture evidence of a check that never happened, which is the exact
-- failure this row exists to prevent ("never trust a tick-box").
--
-- trackingDnsVerifiedAt is a timestamp rather than a boolean on purpose. DNS is
-- a lease, not a fact: the send-time decision expires a value older than
-- TRACKING_DNS_MAX_AGE_DAYS, so tracking closes itself even if the scheduled
-- re-check stops firing.
--
-- ROLLBACK (loses only verification records, which fail safe to OFF):
--   ALTER TABLE "Client" DROP COLUMN "trackingDnsVerifiedAt";
--   ALTER TABLE "Client" DROP COLUMN "trackingDnsCheckedAt";
--   ALTER TABLE "Client" DROP COLUMN "trackingDnsReport";
ALTER TABLE "Client" ADD COLUMN "trackingDnsVerifiedAt" TIMESTAMP(3);
ALTER TABLE "Client" ADD COLUMN "trackingDnsCheckedAt" TIMESTAMP(3);
ALTER TABLE "Client" ADD COLUMN "trackingDnsReport" JSONB;
