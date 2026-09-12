CREATE TABLE "ProspectResearchPlan" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "criteria" JSONB NOT NULL,
  "maxLookups" INTEGER NOT NULL,
  "createdByStaffId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProspectResearchPlan_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProspectResearchPlan_maxLookups_check" CHECK ("maxLookups" BETWEEN 1 AND 100),
  CONSTRAINT "ProspectResearchPlan_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ProspectResearchPlan_clientId_createdAt_idx" ON "ProspectResearchPlan"("clientId", "createdAt");
