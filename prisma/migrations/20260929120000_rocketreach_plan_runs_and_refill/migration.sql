-- Additive RocketReach run history, credit reservations, and per-sequence list top-up.
-- Does not change send, enrolment, suppression, or pacing tables.

ALTER TABLE "Contact" ADD COLUMN "originNote" TEXT;

CREATE INDEX "ContactUniverseSource_rocketReachPersonId_idx" ON "ContactUniverseSource"("rocketReachPersonId");

CREATE TYPE "RocketReachPlanRunTrigger" AS ENUM ('MANUAL', 'AUTO_REFILL', 'PREVIEW');
CREATE TYPE "RocketReachPlanRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED', 'PREVIEW');
CREATE TYPE "RocketReachCreditReservationState" AS ENUM ('RESERVED', 'CHARGED', 'RELEASED');

CREATE TABLE "RocketReachPlanRun" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "sequenceId" TEXT,
  "contactListId" TEXT,
  "triggeredByStaffId" TEXT,
  "trigger" "RocketReachPlanRunTrigger" NOT NULL,
  "status" "RocketReachPlanRunStatus" NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "creditsReserved" INTEGER NOT NULL DEFAULT 0,
  "creditsUsed" INTEGER NOT NULL DEFAULT 0,
  "contactsAdded" INTEGER NOT NULL DEFAULT 0,
  "skipped" JSONB NOT NULL,
  "detail" TEXT,
  "dryRun" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "RocketReachPlanRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RocketReachCreditReservation" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "ruleId" TEXT,
  "profileId" TEXT NOT NULL,
  "state" "RocketReachCreditReservationState" NOT NULL DEFAULT 'RESERVED',
  "reservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  CONSTRAINT "RocketReachCreditReservation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SequenceListRefillRule" (
  "id" TEXT NOT NULL,
  "sequenceId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "lowWaterMark" INTEGER NOT NULL,
  "maxCreditsPerRun" INTEGER NOT NULL,
  "maxCreditsPerDay" INTEGER NOT NULL,
  "maxCreditsPerMonth" INTEGER NOT NULL,
  "balanceFloor" INTEGER NOT NULL,
  "searchStart" INTEGER NOT NULL DEFAULT 1,
  "enabledByStaffId" TEXT,
  "enabledAt" TIMESTAMP(3),
  "disabledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SequenceListRefillRule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RocketReachCreditReservation_runId_profileId_key" ON "RocketReachCreditReservation"("runId", "profileId");
CREATE INDEX "RocketReachCreditReservation_clientId_reservedAt_state_idx" ON "RocketReachCreditReservation"("clientId", "reservedAt", "state");
CREATE INDEX "RocketReachCreditReservation_ruleId_reservedAt_state_idx" ON "RocketReachCreditReservation"("ruleId", "reservedAt", "state");
CREATE INDEX "RocketReachPlanRun_clientId_startedAt_idx" ON "RocketReachPlanRun"("clientId", "startedAt");
CREATE INDEX "RocketReachPlanRun_planId_startedAt_idx" ON "RocketReachPlanRun"("planId", "startedAt");
CREATE INDEX "RocketReachPlanRun_sequenceId_startedAt_idx" ON "RocketReachPlanRun"("sequenceId", "startedAt");
CREATE UNIQUE INDEX "SequenceListRefillRule_sequenceId_key" ON "SequenceListRefillRule"("sequenceId");
CREATE INDEX "SequenceListRefillRule_clientId_enabled_idx" ON "SequenceListRefillRule"("clientId", "enabled");
CREATE INDEX "SequenceListRefillRule_planId_idx" ON "SequenceListRefillRule"("planId");
CREATE INDEX "SequenceListRefillRule_enabledByStaffId_idx" ON "SequenceListRefillRule"("enabledByStaffId");

ALTER TABLE "RocketReachPlanRun" ADD CONSTRAINT "RocketReachPlanRun_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RocketReachPlanRun" ADD CONSTRAINT "RocketReachPlanRun_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ProspectResearchPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RocketReachPlanRun" ADD CONSTRAINT "RocketReachPlanRun_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "ClientEmailSequence"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RocketReachPlanRun" ADD CONSTRAINT "RocketReachPlanRun_triggeredByStaffId_fkey" FOREIGN KEY ("triggeredByStaffId") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RocketReachCreditReservation" ADD CONSTRAINT "RocketReachCreditReservation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RocketReachCreditReservation" ADD CONSTRAINT "RocketReachCreditReservation_runId_fkey" FOREIGN KEY ("runId") REFERENCES "RocketReachPlanRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SequenceListRefillRule" ADD CONSTRAINT "SequenceListRefillRule_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "ClientEmailSequence"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SequenceListRefillRule" ADD CONSTRAINT "SequenceListRefillRule_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SequenceListRefillRule" ADD CONSTRAINT "SequenceListRefillRule_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ProspectResearchPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SequenceListRefillRule" ADD CONSTRAINT "SequenceListRefillRule_enabledByStaffId_fkey" FOREIGN KEY ("enabledByStaffId") REFERENCES "StaffUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SequenceListRefillRule" ADD CONSTRAINT "SequenceListRefillRule_caps_check" CHECK (
  "lowWaterMark" BETWEEN 1 AND 500
  AND "maxCreditsPerRun" BETWEEN 1 AND 10
  AND "maxCreditsPerDay" BETWEEN 1 AND 200
  AND "maxCreditsPerMonth" BETWEEN 1 AND 2000
  AND "maxCreditsPerDay" >= "maxCreditsPerRun"
  AND "maxCreditsPerMonth" >= "maxCreditsPerDay"
  AND "balanceFloor" >= 0
  AND "searchStart" >= 1
);
