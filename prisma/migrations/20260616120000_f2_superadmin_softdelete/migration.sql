-- F2 — super-admin capability + workspace soft-delete.
--
-- Additive only: new nullable columns + one new boolean with a safe default,
-- plus a partial-friendly index on the soft-delete marker. No existing row
-- changes meaning (deletedAt is NULL everywhere; isSuperAdmin defaults false).
-- Assign the super-admin flag to greg@bidlow.co.uk as a SEPARATE, deliberate
-- step after this migration is applied.

-- StaffUser: per-account super-admin capability (gates workspace delete/restore/purge).
ALTER TABLE "StaffUser" ADD COLUMN "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false;

-- Client: soft-delete marker + who deleted it. NULL = live workspace.
ALTER TABLE "Client" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Client" ADD COLUMN "deletedByStaffUserId" TEXT;

-- Index the marker so the "hide soft-deleted" filters stay cheap.
CREATE INDEX "Client_deletedAt_idx" ON "Client"("deletedAt");
