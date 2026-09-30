-- AI campaigns. Additive only. Human sequences, send gates, and do-not-contact are unchanged.

ALTER TABLE "ClientEmailTemplate" ADD COLUMN "systemApprovalKind" TEXT;

ALTER TYPE "RocketReachPlanRunTrigger" ADD VALUE 'AI_CAMPAIGN';

ALTER TABLE "RocketReachPlanRun" ADD COLUMN "aiOutreachCampaignId" TEXT;
ALTER TABLE "RocketReachCreditReservation" ADD COLUMN "aiOutreachCampaignId" TEXT;

CREATE TYPE "AiOutreachCampaignStatus" AS ENUM (
  'SOURCING',
  'WRITING',
  'REVIEWING',
  'REVISING',
  'NEEDS_STAFF',
  'PREPARING',
  'LAUNCHING',
  'RUNNING',
  'PAUSED',
  'STOPPED',
  'COMPLETED',
  'FAILED'
);

CREATE TABLE "AiOutreachCampaign" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" "AiOutreachCampaignStatus" NOT NULL DEFAULT 'SOURCING',
  "resumeStatus" "AiOutreachCampaignStatus",
  "brief" TEXT NOT NULL,
  "jobTitles" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "countries" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "industries" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "seniorities" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "companySizeMin" INTEGER,
  "companySizeMax" INTEGER,
  "targetContactCount" INTEGER NOT NULL,
  "creditBudgetTotal" INTEGER NOT NULL,
  "creditBudgetPerDay" INTEGER NOT NULL,
  "creditsUsed" INTEGER NOT NULL DEFAULT 0,
  "searchStart" INTEGER NOT NULL DEFAULT 1,
  "endsAt" TIMESTAMP(3),
  "contactListId" TEXT,
  "sequenceId" TEXT,
  "researchPlanId" TEXT,
  "reviewScore" INTEGER,
  "reviewRounds" INTEGER NOT NULL DEFAULT 0,
  "reviewFeedback" TEXT,
  "contactsSourced" INTEGER NOT NULL DEFAULT 0,
  "listExhausted" BOOLEAN NOT NULL DEFAULT false,
  "pauseReason" TEXT,
  "staffAlert" TEXT,
  "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
  "createdByStaffUserId" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "pausedAt" TIMESTAMP(3),
  "stoppedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "nextActionAt" TIMESTAMP(3),
  "lastTickedAt" TIMESTAMP(3),
  "tickLockUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiOutreachCampaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiOutreachCampaignEvent" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "stage" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  CONSTRAINT "AiOutreachCampaignEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiOutreachCampaign_sequenceId_key" ON "AiOutreachCampaign"("sequenceId");
CREATE INDEX "AiOutreachCampaign_clientId_status_idx" ON "AiOutreachCampaign"("clientId", "status");
CREATE INDEX "AiOutreachCampaign_status_nextActionAt_idx" ON "AiOutreachCampaign"("status", "nextActionAt");
CREATE INDEX "AiOutreachCampaign_tickLockUntil_idx" ON "AiOutreachCampaign"("tickLockUntil");
CREATE INDEX "AiOutreachCampaign_createdByStaffUserId_idx" ON "AiOutreachCampaign"("createdByStaffUserId");
CREATE INDEX "AiOutreachCampaign_contactListId_idx" ON "AiOutreachCampaign"("contactListId");
CREATE INDEX "AiOutreachCampaign_researchPlanId_idx" ON "AiOutreachCampaign"("researchPlanId");
CREATE INDEX "AiOutreachCampaignEvent_campaignId_at_idx" ON "AiOutreachCampaignEvent"("campaignId", "at");
CREATE INDEX "RocketReachPlanRun_aiOutreachCampaignId_idx" ON "RocketReachPlanRun"("aiOutreachCampaignId");
CREATE INDEX "RocketReachCreditReservation_aiOutreachCampaignId_reservedAt_state_idx" ON "RocketReachCreditReservation"("aiOutreachCampaignId", "reservedAt", "state");

ALTER TABLE "AiOutreachCampaign" ADD CONSTRAINT "AiOutreachCampaign_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiOutreachCampaign" ADD CONSTRAINT "AiOutreachCampaign_createdByStaffUserId_fkey" FOREIGN KEY ("createdByStaffUserId") REFERENCES "StaffUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AiOutreachCampaign" ADD CONSTRAINT "AiOutreachCampaign_contactListId_fkey" FOREIGN KEY ("contactListId") REFERENCES "ContactList"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiOutreachCampaign" ADD CONSTRAINT "AiOutreachCampaign_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "ClientEmailSequence"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiOutreachCampaign" ADD CONSTRAINT "AiOutreachCampaign_researchPlanId_fkey" FOREIGN KEY ("researchPlanId") REFERENCES "ProspectResearchPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiOutreachCampaignEvent" ADD CONSTRAINT "AiOutreachCampaignEvent_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AiOutreachCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RocketReachPlanRun" ADD CONSTRAINT "RocketReachPlanRun_aiOutreachCampaignId_fkey" FOREIGN KEY ("aiOutreachCampaignId") REFERENCES "AiOutreachCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RocketReachCreditReservation" ADD CONSTRAINT "RocketReachCreditReservation_aiOutreachCampaignId_fkey" FOREIGN KEY ("aiOutreachCampaignId") REFERENCES "AiOutreachCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
