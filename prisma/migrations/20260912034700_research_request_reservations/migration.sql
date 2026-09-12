CREATE TYPE "ResearchRequestKind" AS ENUM ('SEARCH', 'LOOKUP');
CREATE TABLE "ProspectResearchRun" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "planId" TEXT NOT NULL UNIQUE REFERENCES "ProspectResearchPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "approvedByStaffId" TEXT NOT NULL,
  "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "maxLookups" INTEGER NOT NULL CHECK ("maxLookups" BETWEEN 1 AND 100),
  "pausedAt" TIMESTAMP(3)
);
CREATE TABLE "ProspectResearchRequest" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "runId" TEXT NOT NULL REFERENCES "ProspectResearchRun"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "requestKey" TEXT NOT NULL,
  "kind" "ResearchRequestKind" NOT NULL,
  "reservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ProspectResearchRequest_runId_requestKey_key" ON "ProspectResearchRequest"("runId", "requestKey");
CREATE INDEX "ProspectResearchRequest_runId_kind_idx" ON "ProspectResearchRequest"("runId", "kind");
