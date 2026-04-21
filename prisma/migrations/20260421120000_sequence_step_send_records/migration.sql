-- Additive (PR D4e.1): ClientEmailSequenceStepSend records-only.
-- Operator-visible per-enrollment, per-step send-planning rows. D4e.1
-- only creates/updates these rows via a planner helper; there is NO
-- dispatcher, NO scheduler, NO MailboxSendReservation, and NO
-- OutboundEmail creation in this PR. D4e.2 consumes READY rows behind
-- the GOVERNED_TEST_EMAIL_DOMAINS allowlist.
--
-- Safety:
--   * No existing columns/tables are altered; no rows are touched.
--   * Cross-table invariants (sequence↔enrollment↔step↔template↔
--     client, approved-template, recipient has email, not suppressed)
--     are enforced in application code
--     (src/server/email-sequences/step-sends.ts). DB triggers are
--     intentionally deferred until the send path exists in D4e.2.
--   * (enrollmentId, stepId) is UNIQUE so re-running the planner for
--     the same step is idempotent and cannot duplicate a recipient.
--   * idempotencyKey is UNIQUE across the client and mirrors
--     `seq:<sequenceId>:enr:<enrollmentId>:step:<stepId>` so D4e.2
--     can correlate plan row → dispatch attempt.

-- Enum: ClientEmailSequenceStepSendStatus
CREATE TYPE "ClientEmailSequenceStepSendStatus" AS ENUM (
    'PLANNED',
    'READY',
    'SKIPPED',
    'SUPPRESSED',
    'BLOCKED',
    'SENT',
    'FAILED'
);

-- Table: ClientEmailSequenceStepSend
CREATE TABLE "ClientEmailSequenceStepSend" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "sequenceId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "contactListId" TEXT NOT NULL,
    "status" "ClientEmailSequenceStepSendStatus" NOT NULL DEFAULT 'PLANNED',
    "idempotencyKey" TEXT NOT NULL,
    "subjectPreview" TEXT,
    "bodyPreview" TEXT,
    "blockedReason" TEXT,
    "failureReason" TEXT,
    "outboundEmailId" TEXT,
    "plannedFor" TIMESTAMP(3),
    "createdByStaffUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientEmailSequenceStepSend_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClientEmailSequenceStepSend_idempotencyKey_key"
    ON "ClientEmailSequenceStepSend"("idempotencyKey");

CREATE UNIQUE INDEX "ClientEmailSequenceStepSend_enrollmentId_stepId_key"
    ON "ClientEmailSequenceStepSend"("enrollmentId", "stepId");

CREATE INDEX "ClientEmailSequenceStepSend_clientId_idx"
    ON "ClientEmailSequenceStepSend"("clientId");
CREATE INDEX "ClientEmailSequenceStepSend_sequenceId_idx"
    ON "ClientEmailSequenceStepSend"("sequenceId");
CREATE INDEX "ClientEmailSequenceStepSend_enrollmentId_idx"
    ON "ClientEmailSequenceStepSend"("enrollmentId");
CREATE INDEX "ClientEmailSequenceStepSend_stepId_idx"
    ON "ClientEmailSequenceStepSend"("stepId");
CREATE INDEX "ClientEmailSequenceStepSend_templateId_idx"
    ON "ClientEmailSequenceStepSend"("templateId");
CREATE INDEX "ClientEmailSequenceStepSend_contactId_idx"
    ON "ClientEmailSequenceStepSend"("contactId");
CREATE INDEX "ClientEmailSequenceStepSend_contactListId_idx"
    ON "ClientEmailSequenceStepSend"("contactListId");
CREATE INDEX "ClientEmailSequenceStepSend_status_idx"
    ON "ClientEmailSequenceStepSend"("status");
CREATE INDEX "ClientEmailSequenceStepSend_createdByStaffUserId_idx"
    ON "ClientEmailSequenceStepSend"("createdByStaffUserId");

ALTER TABLE "ClientEmailSequenceStepSend"
    ADD CONSTRAINT "ClientEmailSequenceStepSend_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClientEmailSequenceStepSend"
    ADD CONSTRAINT "ClientEmailSequenceStepSend_sequenceId_fkey"
    FOREIGN KEY ("sequenceId") REFERENCES "ClientEmailSequence"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClientEmailSequenceStepSend"
    ADD CONSTRAINT "ClientEmailSequenceStepSend_enrollmentId_fkey"
    FOREIGN KEY ("enrollmentId") REFERENCES "ClientEmailSequenceEnrollment"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClientEmailSequenceStepSend"
    ADD CONSTRAINT "ClientEmailSequenceStepSend_stepId_fkey"
    FOREIGN KEY ("stepId") REFERENCES "ClientEmailSequenceStep"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ClientEmailSequenceStepSend"
    ADD CONSTRAINT "ClientEmailSequenceStepSend_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "ClientEmailTemplate"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ClientEmailSequenceStepSend"
    ADD CONSTRAINT "ClientEmailSequenceStepSend_contactId_fkey"
    FOREIGN KEY ("contactId") REFERENCES "Contact"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ClientEmailSequenceStepSend"
    ADD CONSTRAINT "ClientEmailSequenceStepSend_contactListId_fkey"
    FOREIGN KEY ("contactListId") REFERENCES "ContactList"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ClientEmailSequenceStepSend"
    ADD CONSTRAINT "ClientEmailSequenceStepSend_outboundEmailId_fkey"
    FOREIGN KEY ("outboundEmailId") REFERENCES "OutboundEmail"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ClientEmailSequenceStepSend"
    ADD CONSTRAINT "ClientEmailSequenceStepSend_createdByStaffUserId_fkey"
    FOREIGN KEY ("createdByStaffUserId") REFERENCES "StaffUser"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
