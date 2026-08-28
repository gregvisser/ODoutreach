-- Per-client open-tracking opt-in (tracking OFF by default).
--
-- ADDITIVE + REVERSIBLE. Adds two nullable columns to "Client". No existing
-- column is read, rewritten or backfilled, and no row is touched.
--
-- NULL is the OFF state, so every existing client — and every client created
-- from here on — lands with open tracking OFF without a backfill. That is the
-- point of the change: tracking previously defaulted ON and was only held off
-- by the OPEN_TRACKING_PIXEL environment variable being typed correctly.
--
-- Switching a client ON is a deliberate, audited UI action that refuses unless
-- that client's outreachLinkDomain is verified, so a tracked email can only
-- carry a pixel on the customer's own domain.
--
-- ROLLBACK (loses only the opt-in records, which fail safe to OFF):
--   ALTER TABLE "Client" DROP COLUMN "openTrackingEnabledAt";
--   ALTER TABLE "Client" DROP COLUMN "openTrackingEnabledByStaffUserId";
ALTER TABLE "Client" ADD COLUMN "openTrackingEnabledAt" TIMESTAMP(3);
ALTER TABLE "Client" ADD COLUMN "openTrackingEnabledByStaffUserId" TEXT;
