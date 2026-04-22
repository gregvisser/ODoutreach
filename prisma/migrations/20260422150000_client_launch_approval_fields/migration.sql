-- PR K — Client launch approval workflow (additive only).
--
-- Adds explicit approval metadata to the Client model so an authorised
-- operator can record a launch approval trail (who/when/mode/checklist/notes).
--
-- Safety:
--   * All new columns are nullable — existing ACTIVE clients remain untouched
--     and will simply have no recorded approval trail (surfaced in the UI as
--     a "Legacy active client" note).
--   * No existing columns are altered, no data is rewritten.
--   * No sends, imports, or suppression syncs are triggered by this migration.

-- CreateEnum
CREATE TYPE "ClientLaunchApprovalMode" AS ENUM ('CONTROLLED_INTERNAL', 'LIVE_PROSPECT');

-- AlterTable
ALTER TABLE "Client"
    ADD COLUMN "launchApprovedAt" TIMESTAMP(3),
    ADD COLUMN "launchApprovedByStaffUserId" TEXT,
    ADD COLUMN "launchApprovalMode" "ClientLaunchApprovalMode",
    ADD COLUMN "launchApprovalNotes" TEXT,
    ADD COLUMN "launchApprovalChecklist" JSONB;

-- CreateIndex
CREATE INDEX "Client_launchApprovedByStaffUserId_idx"
    ON "Client"("launchApprovedByStaffUserId");

-- AddForeignKey
ALTER TABLE "Client"
    ADD CONSTRAINT "Client_launchApprovedByStaffUserId_fkey"
    FOREIGN KEY ("launchApprovedByStaffUserId")
    REFERENCES "StaffUser"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
