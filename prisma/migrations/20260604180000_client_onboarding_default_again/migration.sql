-- Two corrective changes after the previous default-flip migration:
--
-- 1. Restore ONBOARDING as the default for new clients. Going forward each
--    new client should run the onboarding flow and be auto-promoted to
--    ACTIVE only when every section is complete (no manual approval phrase
--    needed). The previous migration set the default to ACTIVE to unblock
--    sends today — that bulk promotion of existing clients stays in place.
ALTER TABLE "Client" ALTER COLUMN "status" SET DEFAULT 'ONBOARDING';

-- 2. Clear stale step-send rows that were frozen as BLOCKED with reason
--    "blocked_client_inactive" before the client's status was flipped to
--    ACTIVE. These rows still display "Cannot launch — Client is
--    ONBOARDING, not ACTIVE" on the sequence page even though the client
--    is now ACTIVE. Reset them so the operator's next "Prepare send
--    records" run re-classifies them against the current (ACTIVE) state.
UPDATE "ClientEmailSequenceStepSend"
SET "status" = 'PLANNED',
    "blockedReason" = NULL
WHERE "status" = 'BLOCKED'
  AND "blockedReason" LIKE '%blocked_client_inactive%';
