-- Clients now default to ACTIVE on creation (no formal launch-approval step
-- required to start outreach). The dispatcher's safety gate still blocks
-- PAUSED / ARCHIVED clients — only ONBOARDING is being removed from the
-- default lifecycle, since in practice every client we create is ready to
-- send and the gate added friction without value.

-- New clients: change column default.
ALTER TABLE "Client" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';

-- Existing clients: promote anyone still sitting in ONBOARDING so the
-- dispatcher stops blocking their real-prospect sends. We deliberately do
-- NOT touch launchApprovedAt / launchApprovedByStaffUserId — those remain
-- null for migrated rows, which correctly reflects that no individual
-- approval was performed; the change was a fleet-wide policy decision.
UPDATE "Client" SET "status" = 'ACTIVE' WHERE "status" = 'ONBOARDING';
