-- Additive (PR D4a): ClientEmailTemplate foundation.
-- Per-client message library (introduction + follow-up 1..5) with an
-- approval lifecycle (DRAFT → READY_FOR_REVIEW → APPROVED → ARCHIVED).
--
-- Safety:
--   * No existing columns/tables are altered; no rows are touched.
--   * No send-time fields and no references from any outbound worker.
--   * Placeholder validation is application-side; approval is blocked by
--     server-side policy when unknown placeholders are present, but the
--     DB accepts any TEXT so operators can iterate in DRAFT.
--
-- Follow-up PRs:
--   PR D4b will introduce a sequence / step model that references
--   ClientEmailTemplate.id — this migration intentionally does NOT add
--   any such references yet.

-- Enum: ClientEmailTemplateCategory
CREATE TYPE "ClientEmailTemplateCategory" AS ENUM (
    'INTRODUCTION',
    'FOLLOW_UP_1',
    'FOLLOW_UP_2',
    'FOLLOW_UP_3',
    'FOLLOW_UP_4',
    'FOLLOW_UP_5'
);

-- Enum: ClientEmailTemplateStatus
CREATE TYPE "ClientEmailTemplateStatus" AS ENUM (
    'DRAFT',
    'READY_FOR_REVIEW',
    'APPROVED',
    'ARCHIVED'
);

-- Table: ClientEmailTemplate
CREATE TABLE "ClientEmailTemplate" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "ClientEmailTemplateCategory" NOT NULL,
    "subject" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" "ClientEmailTemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "createdByStaffUserId" TEXT,
    "approvedByStaffUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientEmailTemplate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ClientEmailTemplate_clientId_idx"
    ON "ClientEmailTemplate"("clientId");
CREATE INDEX "ClientEmailTemplate_clientId_status_idx"
    ON "ClientEmailTemplate"("clientId", "status");
CREATE INDEX "ClientEmailTemplate_clientId_category_idx"
    ON "ClientEmailTemplate"("clientId", "category");
CREATE INDEX "ClientEmailTemplate_createdByStaffUserId_idx"
    ON "ClientEmailTemplate"("createdByStaffUserId");
CREATE INDEX "ClientEmailTemplate_approvedByStaffUserId_idx"
    ON "ClientEmailTemplate"("approvedByStaffUserId");

ALTER TABLE "ClientEmailTemplate"
    ADD CONSTRAINT "ClientEmailTemplate_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClientEmailTemplate"
    ADD CONSTRAINT "ClientEmailTemplate_createdByStaffUserId_fkey"
    FOREIGN KEY ("createdByStaffUserId") REFERENCES "StaffUser"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ClientEmailTemplate"
    ADD CONSTRAINT "ClientEmailTemplate_approvedByStaffUserId_fkey"
    FOREIGN KEY ("approvedByStaffUserId") REFERENCES "StaffUser"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
