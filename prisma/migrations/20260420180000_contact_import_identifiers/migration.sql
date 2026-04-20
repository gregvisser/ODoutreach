-- Additive: first-class outreach identifier fields on Contact
-- (docs/ops/CLIENT_WORKSPACE_MODULE_AUDIT.md §0.1).
-- Email remains required; these columns are nullable so LinkedIn-only or
-- phone-only contacts can be persisted once email-optional persistence lands
-- in a follow-up PR. No indexes are changed.

ALTER TABLE "Contact" ADD COLUMN "linkedIn" TEXT;
ALTER TABLE "Contact" ADD COLUMN "mobilePhone" TEXT;
ALTER TABLE "Contact" ADD COLUMN "officePhone" TEXT;
ALTER TABLE "Contact" ADD COLUMN "location" TEXT;
ALTER TABLE "Contact" ADD COLUMN "city" TEXT;
ALTER TABLE "Contact" ADD COLUMN "country" TEXT;
