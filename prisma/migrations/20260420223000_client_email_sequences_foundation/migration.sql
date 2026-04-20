-- Additive (PR D4b): ClientEmailSequence foundation.
-- Per-client outreach sequence records that pair one ContactList with
-- an ordered ladder of ClientEmailTemplate steps. Approval flow is
-- OpensDoors-gated and records-only — no send, no schedule, no enroll.
--
-- Safety:
--   * No existing columns/tables are altered; no rows are touched.
--   * No send-time fields. No outbound worker reads these rows.
--   * Cross-table invariants (sequence↔contactList client match,
--     step↔template client match, step.category === template.category,
--     only APPROVED templates allowed in APPROVED sequences) are
--     enforced in application code (see
--     `src/lib/email-sequences/sequence-policy.ts` and
--     `src/server/email-sequences/*`). DB-level enforcement via
--     triggers is deferred to a follow-up PR — there are no sends yet
--     that could bypass the app layer.
--
-- Follow-up PRs:
--   * Send/schedule wiring (enrollments, per-contact progression,
--     reply exits, daily-cap interplay) — intentionally NOT here.

-- Enum: ClientEmailSequenceStatus
CREATE TYPE "ClientEmailSequenceStatus" AS ENUM (
    'DRAFT',
    'READY_FOR_REVIEW',
    'APPROVED',
    'ARCHIVED'
);

-- Table: ClientEmailSequence
CREATE TABLE "ClientEmailSequence" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "contactListId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "ClientEmailSequenceStatus" NOT NULL DEFAULT 'DRAFT',
    "createdByStaffUserId" TEXT,
    "approvedByStaffUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientEmailSequence_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ClientEmailSequence_clientId_idx"
    ON "ClientEmailSequence"("clientId");
CREATE INDEX "ClientEmailSequence_clientId_status_idx"
    ON "ClientEmailSequence"("clientId", "status");
CREATE INDEX "ClientEmailSequence_contactListId_idx"
    ON "ClientEmailSequence"("contactListId");
CREATE INDEX "ClientEmailSequence_createdByStaffUserId_idx"
    ON "ClientEmailSequence"("createdByStaffUserId");
CREATE INDEX "ClientEmailSequence_approvedByStaffUserId_idx"
    ON "ClientEmailSequence"("approvedByStaffUserId");

ALTER TABLE "ClientEmailSequence"
    ADD CONSTRAINT "ClientEmailSequence_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClientEmailSequence"
    ADD CONSTRAINT "ClientEmailSequence_contactListId_fkey"
    FOREIGN KEY ("contactListId") REFERENCES "ContactList"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ClientEmailSequence"
    ADD CONSTRAINT "ClientEmailSequence_createdByStaffUserId_fkey"
    FOREIGN KEY ("createdByStaffUserId") REFERENCES "StaffUser"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ClientEmailSequence"
    ADD CONSTRAINT "ClientEmailSequence_approvedByStaffUserId_fkey"
    FOREIGN KEY ("approvedByStaffUserId") REFERENCES "StaffUser"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Table: ClientEmailSequenceStep
CREATE TABLE "ClientEmailSequenceStep" (
    "id" TEXT NOT NULL,
    "sequenceId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "category" "ClientEmailTemplateCategory" NOT NULL,
    "position" INTEGER NOT NULL,
    "delayDays" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientEmailSequenceStep_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClientEmailSequenceStep_sequenceId_position_key"
    ON "ClientEmailSequenceStep"("sequenceId", "position");
CREATE UNIQUE INDEX "ClientEmailSequenceStep_sequenceId_category_key"
    ON "ClientEmailSequenceStep"("sequenceId", "category");
CREATE INDEX "ClientEmailSequenceStep_templateId_idx"
    ON "ClientEmailSequenceStep"("templateId");

ALTER TABLE "ClientEmailSequenceStep"
    ADD CONSTRAINT "ClientEmailSequenceStep_sequenceId_fkey"
    FOREIGN KEY ("sequenceId") REFERENCES "ClientEmailSequence"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClientEmailSequenceStep"
    ADD CONSTRAINT "ClientEmailSequenceStep_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "ClientEmailTemplate"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
