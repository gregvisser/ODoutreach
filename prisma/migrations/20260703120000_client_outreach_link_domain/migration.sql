-- Sender-aligned outreach link domain (go.<customer-domain>).
--
-- ADDITIVE + REVERSIBLE. Adds two nullable columns to "Client" for the per-client
-- outreach link domain that serves unsubscribe + open-tracking links, so links
-- align with the sending domain (avoids the cross-domain / phishing signal that
-- was getting outreach quarantined). No existing column is read or rewritten.
--
-- INERT until code sets these values AND the OUTREACH_REQUIRE_ALIGNED_LINK_DOMAIN
-- flag enforces the hard rule — with both unset, the live send path is unchanged.
--
-- ROLLBACK (no data loss elsewhere):
--   ALTER TABLE "Client" DROP COLUMN "outreachLinkDomain";
--   ALTER TABLE "Client" DROP COLUMN "outreachLinkDomainVerifiedAt";
ALTER TABLE "Client" ADD COLUMN "outreachLinkDomain" TEXT;
ALTER TABLE "Client" ADD COLUMN "outreachLinkDomainVerifiedAt" TIMESTAMP(3);
