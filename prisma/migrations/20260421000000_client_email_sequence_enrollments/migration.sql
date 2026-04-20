-- Additive (PR D4c): ClientEmailSequenceEnrollment records-only.
-- Operator-visible enrollment rows that pair a specific Contact with a
-- ClientEmailSequence's target ContactList. There is NO scheduler, NO
-- step-send worker, and NO send-time behaviour attached to these rows
-- in this PR. Per-step sends land in PR D4e.
--
-- Safety:
--   * No existing columns/tables are altered; no rows are touched.
--   * Cross-table invariants (enrollment.clientId === sequence.clientId,
--     enrollment.contactListId === sequence.contactListId,
--     enrollment.contactId is a member of the target list,
--     contact email-sendable at enroll time) are enforced in application
--     code (src/server/email-sequences/enrollments.ts). DB triggers are
--     intentionally deferred until the send path exists in PR D4e.
--   * (sequenceId, contactId) is UNIQUE so re-running "Create enrollment
--     records" is idempotent and cannot duplicate a recipient.

-- Enum: ClientEmailSequenceEnrollmentStatus
CREATE TYPE "ClientEmailSequenceEnrollmentStatus" AS ENUM (
    'PENDING',
    'PAUSED',
    'COMPLETED',
    'EXCLUDED'
);

-- Table: ClientEmailSequenceEnrollment
CREATE TABLE "ClientEmailSequenceEnrollment" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "sequenceId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "contactListId" TEXT NOT NULL,
    "status" "ClientEmailSequenceEnrollmentStatus" NOT NULL DEFAULT 'PENDING',
    "exclusionReason" TEXT,
    "currentStepPosition" INTEGER NOT NULL DEFAULT 0,
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pausedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdByStaffUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientEmailSequenceEnrollment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClientEmailSequenceEnrollment_sequenceId_contactId_key"
    ON "ClientEmailSequenceEnrollment"("sequenceId", "contactId");
CREATE INDEX "ClientEmailSequenceEnrollment_clientId_idx"
    ON "ClientEmailSequenceEnrollment"("clientId");
CREATE INDEX "ClientEmailSequenceEnrollment_sequenceId_status_idx"
    ON "ClientEmailSequenceEnrollment"("sequenceId", "status");
CREATE INDEX "ClientEmailSequenceEnrollment_contactId_idx"
    ON "ClientEmailSequenceEnrollment"("contactId");
CREATE INDEX "ClientEmailSequenceEnrollment_contactListId_idx"
    ON "ClientEmailSequenceEnrollment"("contactListId");
CREATE INDEX "ClientEmailSequenceEnrollment_createdByStaffUserId_idx"
    ON "ClientEmailSequenceEnrollment"("createdByStaffUserId");

ALTER TABLE "ClientEmailSequenceEnrollment"
    ADD CONSTRAINT "ClientEmailSequenceEnrollment_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClientEmailSequenceEnrollment"
    ADD CONSTRAINT "ClientEmailSequenceEnrollment_sequenceId_fkey"
    FOREIGN KEY ("sequenceId") REFERENCES "ClientEmailSequence"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClientEmailSequenceEnrollment"
    ADD CONSTRAINT "ClientEmailSequenceEnrollment_contactId_fkey"
    FOREIGN KEY ("contactId") REFERENCES "Contact"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ClientEmailSequenceEnrollment"
    ADD CONSTRAINT "ClientEmailSequenceEnrollment_contactListId_fkey"
    FOREIGN KEY ("contactListId") REFERENCES "ContactList"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ClientEmailSequenceEnrollment"
    ADD CONSTRAINT "ClientEmailSequenceEnrollment_createdByStaffUserId_fkey"
    FOREIGN KEY ("createdByStaffUserId") REFERENCES "StaffUser"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
